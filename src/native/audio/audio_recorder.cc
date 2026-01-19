#include <nan.h>
#include "audio_recorder_impl.h"
#include <vector>
#include <uv.h>

using namespace v8;

// Async handle for emitting events to JavaScript
struct AsyncData {
  uv_async_t async;
  Nan::Persistent<Object> emitter;
  float audioLevel;
  std::string eventName;

  AsyncData() : audioLevel(0.0f) {
    uv_async_init(uv_default_loop(), &async, AsyncCallback);
    async.data = this;
  }

  ~AsyncData() {
    emitter.Reset();
    uv_close(reinterpret_cast<uv_handle_t*>(&async), nullptr);
  }

  static void AsyncCallback(uv_async_t* handle) {
    Nan::HandleScope scope;
    AsyncData* data = static_cast<AsyncData*>(handle->data);

    if (!data->emitter.IsEmpty()) {
      Local<Object> emitter = Nan::New(data->emitter);

      // Get the emit function
      Local<String> emitKey = Nan::New("emit").ToLocalChecked();
      Local<Context> context = Nan::GetCurrentContext();
      Local<Function> emit = emitter->Get(context, emitKey).ToLocalChecked().As<Function>();

      // Call emit(event, level)
      Local<Value> argv[] = {
        Nan::New(data->eventName.c_str()).ToLocalChecked(),
        Nan::New(data->audioLevel)
      };
      Nan::Call(emit, emitter, 2, argv);
    }
  }
};

class AudioRecorder : public Nan::ObjectWrap {
 public:
  static NAN_MODULE_INIT(Init) {
    Nan::HandleScope scope;

    v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
    tpl->SetClassName(Nan::New("AudioRecorder").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(tpl, "start", Start);
    Nan::SetPrototypeMethod(tpl, "stop", Stop);
    Nan::SetPrototypeMethod(tpl, "getAudioData", GetAudioData);
    Nan::SetPrototypeMethod(tpl, "getAudioLevel", GetAudioLevel);

    constructor().Reset(Nan::GetFunction(tpl).ToLocalChecked());
    Nan::Set(target, Nan::New("AudioRecorder").ToLocalChecked(),
             Nan::GetFunction(tpl).ToLocalChecked());
  }

 private:
  explicit AudioRecorder() {
    impl_ = new AudioRecorderImpl();
    async_ = new AsyncData();
    async_->eventName = "audio-level";

    // Set up the callback from native to JavaScript
    impl_->SetAudioLevelCallback([this](float level) {
      async_->audioLevel = level;
      uv_async_send(&async_->async);
    });
  }

  ~AudioRecorder() {
    delete async_;
    delete impl_;
  }

  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      AudioRecorder* obj = new AudioRecorder();
      obj->Wrap(info.This());

      // Store the emitter reference for async callbacks
      if (!obj->async_->emitter.IsEmpty()) {
        obj->async_->emitter.Reset();
      }
      obj->async_->emitter.Reset(info.This());

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

  static NAN_METHOD(GetAudioLevel) {
    AudioRecorder* obj = ObjectWrap::Unwrap<AudioRecorder>(info.Holder());
    float level = obj->impl_->GetAudioLevel();
    info.GetReturnValue().Set(Nan::New(level));
  }

  static inline Nan::Persistent<v8::Function>& constructor() {
    static Nan::Persistent<v8::Function> my_constructor;
    return my_constructor;
  }

  AudioRecorderImpl* impl_;
  AsyncData* async_;
};

NODE_MODULE(audio_recorder, AudioRecorder::Init)
