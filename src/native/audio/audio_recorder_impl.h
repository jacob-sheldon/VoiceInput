#ifndef AUDIO_RECORDER_IMPL_H
#define AUDIO_RECORDER_IMPL_H

#include <vector>
#include <cstdint>

class AudioRecorderImpl {
 public:
  AudioRecorderImpl();
  ~AudioRecorderImpl();

  bool Start();
  void Stop();
  const std::vector<uint8_t>& GetAudioData() const;

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

#endif  // AUDIO_RECORDER_IMPL_H
