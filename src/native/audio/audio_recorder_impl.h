#ifndef AUDIO_RECORDER_IMPL_H
#define AUDIO_RECORDER_IMPL_H

#include <vector>
#include <cstdint>
#include <functional>

class AudioRecorderImpl {
 public:
  using AudioLevelCallback = std::function<void(float)>;

  AudioRecorderImpl();
  ~AudioRecorderImpl();

  bool Start();
  void Stop();
  const std::vector<uint8_t>& GetAudioData() const;

  void SetAudioLevelCallback(AudioLevelCallback callback);
  float GetAudioLevel() const;

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

#endif  // AUDIO_RECORDER_IMPL_H
