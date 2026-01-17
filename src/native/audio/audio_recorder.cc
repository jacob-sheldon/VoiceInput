#include <nan.h>
#include "audio_recorder_impl.h"
#include <vector>

using namespace v8;

class AudioRecorder : public Nan::ObjectWrap {
 public:
  static NAN_MODULE_INIT(Init) {
    v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
    tpl->SetClassName(Nan::New("AudioRecorder").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(tpl, "start", Start);
    Nan::SetPrototypeMethod(tpl, "stop", Stop);
    Nan::SetPrototypeMethod(tpl, "getAudioData", GetAudioData);

    constructor().Reset(Nan::GetFunction(tpl).ToLocalChecked());
    Nan::Set(target, Nan::New("AudioRecorder").ToLocalChecked(),
             Nan::GetFunction(tpl).ToLocalChecked());
  }

 private:
  explicit AudioRecorder() {
    impl_ = new AudioRecorderImpl();
  }

  ~AudioRecorder() {
    delete impl_;
  }

  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      AudioRecorder* obj = new AudioRecorder();
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      v8::Local<v8::Function> cons = Nan::New(constructor());
      info.GetReturnValue().Set(cons->NewInstance(
          Nan::GetCurrentContext()).ToLocalChecked());
    }
  }

  static NAN_METHOD(Start) {
    AudioRecorder* obj = ObjectWrap::Unwrap<AudioRecorder>(info.Holder());
    bool success = obj->impl_->Start();
    info.GetReturnValue().Set(Nan::New(success));
  }

  static NAN_METHOD(Stop) {
    AudioRecorder* obj = ObjectWrap::Unwrap<AudioRecorder>(info.Holder());
    obj->impl_->Stop();
    info.GetReturnValue().SetUndefined();
  }

  static NAN_METHOD(GetAudioData) {
    AudioRecorder* obj = ObjectWrap::Unwrap<AudioRecorder>(info.Holder());

    const std::vector<uint8_t>& audioData = obj->impl_->GetAudioData();

    // Create a Buffer with the audio data
    Nan::MaybeLocal<v8::Object> buffer = Nan::CopyBuffer(
        reinterpret_cast<const char*>(audioData.data()),
        audioData.size()
    );

    if (!buffer.IsEmpty()) {
      info.GetReturnValue().Set(buffer.ToLocalChecked());
    } else {
      info.GetReturnValue().Set(Nan::Null());
    }
  }

  static inline Nan::Persistent<v8::Function>& constructor() {
    static Nan::Persistent<v8::Function> my_constructor;
    return my_constructor;
  }

  AudioRecorderImpl* impl_;
};

NODE_MODULE(audio_recorder, AudioRecorder::Init)
