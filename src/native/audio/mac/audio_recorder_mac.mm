#include "../audio_recorder_impl.h"
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#include <string>
#include <cmath>

// Helper class to bridge C++ and Objective-C
@interface AudioRecorderHelper : NSObject
@property (nonatomic, assign) void* implPtr;
- (void)processBuffer:(AVAudioPCMBuffer*)buffer;
@end

@implementation AudioRecorderHelper
- (void)processBuffer:(AVAudioPCMBuffer*)buffer {
  // This will be called from Objective-C block
  // The actual processing is done in the C++ class
}
@end

class AudioRecorderImpl::Impl {
 public:
  Impl()
      : isRecording_(false),
        audioEngine_(nil),
        inputNode_(nil),
        currentAudioLevel_(0.0f),
        audioLevelCallback_(nullptr),
        helper_(nil) {
    // Set up temporary file path as C++ string
    NSString* tempDir = NSTemporaryDirectory();
    NSString* path = [tempDir stringByAppendingPathComponent:@"recording.wav"];
    outputFilePath_ = std::string([path UTF8String]);
    printf("[AudioRecorder] Output path: %s\n", outputFilePath_.c_str()); fflush(stdout);

    // Initialize audio engine
    audioEngine_ = [[AVAudioEngine alloc] init];
    inputNode_ = [audioEngine_ inputNode];

    // Create helper for Objective-C callbacks
    helper_ = [[AudioRecorderHelper alloc] init];
    helper_.implPtr = this;
  }

  ~Impl() {
    if (isRecording_) {
      Stop();
    }
    if (helper_) {
      helper_.implPtr = nil;
      helper_ = nil;
    }
  }

  bool Start() {
    @autoreleasepool {
      if (isRecording_) return false;

      printf("[AudioRecorder] Starting recording with AVAudioEngine\n"); fflush(stdout);

      // Clear previous audio data
      audioDataBuffer_.clear();
      pcmBuffer_.clear();
      sourceSamples_.clear();
      currentAudioLevel_ = 0.0f;

      // Delete existing file if present
      NSString* outputPath = [NSString stringWithUTF8String:outputFilePath_.c_str()];
      NSFileManager* fm = [NSFileManager defaultManager];
      if ([fm fileExistsAtPath:outputPath]) {
        [fm removeItemAtPath:outputPath error:nil];
      }

      // Get the input node's output format (hardware format)
      AVAudioFormat* inputFormat = [inputNode_ outputFormatForBus:0];
      sourceSampleRate_ = [inputFormat sampleRate];
      printf("[AudioRecorder] Hardware sample rate: %.0f Hz\n", sourceSampleRate_); fflush(stdout);

      // Install tap on input node with its native format (no conversion)
      __block Impl* blockThis = this;
      [inputNode_ installTapOnBus:0 bufferSize:4096 format:inputFormat block:^(AVAudioPCMBuffer* buffer, AVAudioTime* when) {
        blockThis->ProcessAudioBuffer(buffer);
      }];

      // Start the audio engine
      NSError* error = nil;
      isRecording_ = [audioEngine_ startAndReturnError:&error];

      if (error || !isRecording_) {
        NSLog(@"Failed to start audio engine: %@", error);
        return false;
      }

      printf("[AudioRecorder] Recording started: %d\n", isRecording_); fflush(stdout);
      return isRecording_;
    }
  }

  void Stop() {
    @autoreleasepool {
      if (!isRecording_) return;

      // Stop the audio engine
      [audioEngine_ stop];
      [inputNode_ removeTapOnBus:0];
      isRecording_ = false;

      printf("[AudioRecorder] Recording stopped\n"); fflush(stdout);

      // Wait a moment for processing to complete
      [NSThread sleepForTimeInterval:0.1];

      // Resample from source rate to 16kHz and save to WAV
      if (!sourceSamples_.empty()) {
        ResampleAndSave();
      }

      // Read the WAV file back into the audioDataBuffer_
      NSString* outputPath = [NSString stringWithUTF8String:outputFilePath_.c_str()];
      NSFileHandle* fileHandle = [NSFileHandle fileHandleForReadingAtPath:outputPath];
      if (fileHandle) {
        NSData* audioData = [fileHandle readDataToEndOfFile];
        audioDataBuffer_.assign(
          static_cast<const uint8_t*>([audioData bytes]),
          static_cast<const uint8_t*>([audioData bytes]) + [audioData length]
        );
        [fileHandle closeFile];
        printf("[AudioRecorder] Read %zu bytes from WAV file\n", audioDataBuffer_.size()); fflush(stdout);
      } else {
        printf("[AudioRecorder] Failed to read audio file\n"); fflush(stdout);
      }
    }
  }

  const std::vector<uint8_t>& GetAudioData() const {
    return audioDataBuffer_;
  }

  void SetAudioLevelCallback(AudioLevelCallback callback) {
    audioLevelCallback_ = callback;
  }

  float GetAudioLevel() const {
    return currentAudioLevel_;
  }

 private:
  void ProcessAudioBuffer(AVAudioPCMBuffer* buffer) {
    if (buffer.frameLength == 0) return;

    // Access float32 data from the buffer
    float* const* channelData = buffer.floatChannelData;

    // Handle mono or stereo (just take first channel)
    float* samples = channelData[0];

    // Store source samples as float for resampling later
    for (UInt32 i = 0; i < buffer.frameLength; i++) {
      sourceSamples_.push_back(samples[i]);
    }

    // Calculate RMS (Root Mean Square) for audio level
    double sumSquares = 0.0;
    for (UInt32 i = 0; i < buffer.frameLength; i++) {
      sumSquares += samples[i] * samples[i];
    }
    double rms = std::sqrt(sumSquares / buffer.frameLength);

    // Apply logarithmic scaling for better visual response
    // Use power function to make quiet sounds more visible
    float level = static_cast<float>(std::pow(std::max(0.001, rms), 0.4) * 3.0);
    level = std::min(1.0f, level);
    currentAudioLevel_ = level;

    // Emit audio level through callback
    if (audioLevelCallback_) {
      audioLevelCallback_(level);
      // Log every ~30th buffer to avoid spam (4096 samples / 48000 Hz ≈ 0.085s per buffer, so ~30 buffers ≈ 2.5s)
      static int callCount = 0;
      if (++callCount % 30 == 0) {
        printf("[AudioRecorder] Audio level callback invoked: %.3f\n", level); fflush(stdout);
      }
    }
  }

  void ResampleAndSave() {
    const double targetSampleRate = 16000.0;
    double ratio = sourceSampleRate_ / targetSampleRate;

    // Simple linear interpolation resampling
    size_t targetLength = static_cast<size_t>(sourceSamples_.size() / ratio);
    pcmBuffer_.clear();
    pcmBuffer_.reserve(targetLength);

    for (size_t i = 0; i < targetLength; i++) {
      double sourcePos = i * ratio;
      size_t index1 = static_cast<size_t>(sourcePos);
      size_t index2 = std::min(index1 + 1, sourceSamples_.size() - 1);
      double frac = sourcePos - index1;

      // Linear interpolation
      float sample = sourceSamples_[index1] * (1.0 - frac) + sourceSamples_[index2] * frac;

      // Clamp to [-1.0, 1.0] and convert to int16
      float clamped = fmaxf(-1.0f, fminf(1.0f, sample));
      int16_t sampleInt16 = static_cast<int16_t>(clamped * 32767.0f);
      pcmBuffer_.push_back(sampleInt16);
    }

    printf("[AudioRecorder] Resampled %zu samples to %zu samples (%.0f Hz -> %.0f Hz)\n",
           sourceSamples_.size(), pcmBuffer_.size(), sourceSampleRate_, targetSampleRate); fflush(stdout);

    // Now save the resampled PCM as WAV
    SaveAsWav();
  }

  void SaveAsWav() {
    if (pcmBuffer_.empty()) return;

    NSString* outputPath = [NSString stringWithUTF8String:outputFilePath_.c_str()];
    NSFileHandle* fileHandle = [NSFileHandle fileHandleForWritingAtPath:outputPath];

    if (!fileHandle) {
      [[NSFileManager defaultManager] createFileAtPath:outputPath
                                              contents:nil
                                            attributes:nil];
      fileHandle = [NSFileHandle fileHandleForWritingAtPath:outputPath];
    }

    if (!fileHandle) {
      NSLog(@"Failed to create output file");
      return;
    }

    // WAV header structure
    struct WAVHeader {
      char riff[4];           // "RIFF"
      uint32_t fileSize;      // Total file size - 8
      char wave[4];           // "WAVE"
      char fmt[4];            // "fmt "
      uint32_t fmtSize;       // 16 for PCM
      uint16_t audioFormat;   // 1 for PCM
      uint16_t numChannels;   // 1 for mono
      uint32_t sampleRate;    // 16000
      uint32_t byteRate;      // sampleRate * numChannels * bitsPerSample/8
      uint16_t blockAlign;    // numChannels * bitsPerSample/8
      uint16_t bitsPerSample; // 16
      char data[4];           // "data"
      uint32_t dataSize;      // Size of data
    };

    // Calculate sizes
    uint32_t dataSize = pcmBuffer_.size() * sizeof(int16_t);
    uint32_t fileSize = 36 + dataSize;  // 36 + data size

    // Create and write WAV header
    WAVHeader header;
    memcpy(header.riff, "RIFF", 4);
    header.fileSize = fileSize;
    memcpy(header.wave, "WAVE", 4);
    memcpy(header.fmt, "fmt ", 4);
    header.fmtSize = 16;
    header.audioFormat = 1;
    header.numChannels = 1;
    header.sampleRate = 16000;
    header.byteRate = 16000 * 1 * 2;
    header.blockAlign = 2;
    header.bitsPerSample = 16;
    memcpy(header.data, "data", 4);
    header.dataSize = dataSize;

    // Write header
    NSData* headerData = [NSData dataWithBytes:&header length:sizeof(WAVHeader)];
    [fileHandle writeData:headerData];

    // Write PCM data
    NSData* pcmData = [NSData dataWithBytes:pcmBuffer_.data() length:dataSize];
    [fileHandle writeData:pcmData];

    [fileHandle closeFile];
    printf("[AudioRecorder] Saved %zu samples as WAV\n", pcmBuffer_.size()); fflush(stdout);
  }

  bool isRecording_;
  AVAudioEngine* audioEngine_;
  AVAudioInputNode* inputNode_;
  std::string outputFilePath_;
  std::vector<uint8_t> audioDataBuffer_;
  std::vector<int16_t> pcmBuffer_;
  std::vector<float> sourceSamples_;
  double sourceSampleRate_;
  float currentAudioLevel_;
  AudioLevelCallback audioLevelCallback_;
  AudioRecorderHelper* helper_;
};

AudioRecorderImpl::AudioRecorderImpl() : impl_(new Impl()) {}

AudioRecorderImpl::~AudioRecorderImpl() = default;

bool AudioRecorderImpl::Start() {
  return impl_->Start();
}

void AudioRecorderImpl::Stop() {
  impl_->Stop();
}

const std::vector<uint8_t>& AudioRecorderImpl::GetAudioData() const {
  return impl_->GetAudioData();
}

void AudioRecorderImpl::SetAudioLevelCallback(AudioLevelCallback callback) {
  impl_->SetAudioLevelCallback(callback);
}

float AudioRecorderImpl::GetAudioLevel() const {
  return impl_->GetAudioLevel();
}
