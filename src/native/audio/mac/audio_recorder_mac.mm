#include "../audio_recorder_impl.h"
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#include <string>

class AudioRecorderImpl::Impl {
 public:
  Impl() : isRecording_(false), audioRecorder_(nil) {
    // Set up temporary file path as C++ string
    NSString* tempDir = NSTemporaryDirectory();
    NSString* path = [tempDir stringByAppendingPathComponent:@"recording.wav"];
    outputFilePath_ = std::string([path UTF8String]);
    printf("[AudioRecorder] Output path: %s\n", outputFilePath_.c_str()); fflush(stdout);
  }

  ~Impl() {
    if (isRecording_) {
      Stop();
    }
  }

  bool Start() {
    @autoreleasepool {
      if (isRecording_) return false;

      // Convert C++ string to NSString for Objective-C APIs
      NSString* outputPath = [NSString stringWithUTF8String:outputFilePath_.c_str()];
      printf("[AudioRecorder] Starting recording to: %s\n", outputFilePath_.c_str()); fflush(stdout);

      // Delete existing file if present
      NSFileManager* fm = [NSFileManager defaultManager];
      if ([fm fileExistsAtPath:outputPath]) {
        [fm removeItemAtPath:outputPath error:nil];
      }

      // Recorder settings for 16kHz mono PCM
      NSDictionary* settings = @{
        AVFormatIDKey: @(kAudioFormatLinearPCM),
        AVSampleRateKey: @16000.0,
        AVNumberOfChannelsKey: @1,
        AVLinearPCMBitDepthKey: @16,
        AVLinearPCMIsBigEndianKey: @NO,
        AVLinearPCMIsFloatKey: @NO,
        AVLinearPCMIsNonInterleaved: @NO
      };

      // Create URL for output file
      NSURL* outputURL = [NSURL fileURLWithPath:outputPath];

      // Create recorder
      NSError* error = nil;
      audioRecorder_ = [[AVAudioRecorder alloc] initWithURL:outputURL
                                                    settings:settings
                                                       error:&error];

      if (error || !audioRecorder_) {
        NSLog(@"Failed to create audio recorder: %@", error);
        return false;
      }

      // Prepare to record
      [audioRecorder_ prepareToRecord];

      // Start recording
      isRecording_ = [audioRecorder_ record];
      printf("[AudioRecorder] Recording started: %d\n", isRecording_); fflush(stdout);
      return isRecording_;
    }
  }

  void Stop() {
    @autoreleasepool {
      if (!isRecording_) return;

      [audioRecorder_ stop];
      isRecording_ = false;

      // Wait a moment for file to be written
      [NSThread sleepForTimeInterval:0.1];

      // Convert C++ string to NSString
      NSString* outputPath = [NSString stringWithUTF8String:outputFilePath_.c_str()];

      // Read the audio file into memory
      NSFileHandle* fileHandle = [NSFileHandle fileHandleForReadingAtPath:outputPath];
      if (fileHandle) {
        NSData* audioData = [fileHandle readDataToEndOfFile];
        audioDataBuffer_.assign(
          static_cast<const uint8_t*>([audioData bytes]),
          static_cast<const uint8_t*>([audioData bytes]) + [audioData length]
        );
        [fileHandle closeFile];
        printf("[AudioRecorder] Read %zu bytes\n", audioDataBuffer_.size()); fflush(stdout);
      } else {
        printf("[AudioRecorder] Failed to read audio file\n"); fflush(stdout);
      }
    }
  }

  const std::vector<uint8_t>& GetAudioData() const {
    return audioDataBuffer_;
  }

 private:
  bool isRecording_;
  AVAudioRecorder* audioRecorder_;
  std::string outputFilePath_;  // Store as C++ string instead of NSString*
  std::vector<uint8_t> audioDataBuffer_;
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
