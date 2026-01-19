#include <nan.h>
#include "text_injection_impl.h"

using namespace v8;

class TextInjection : public Nan::ObjectWrap {
 public:
  static NAN_MODULE_INIT(Init) {
    v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
    tpl->SetClassName(Nan::New("TextInjection").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(tpl, "injectText", InjectText);
    Nan::SetPrototypeMethod(tpl, "getFocusedAppInfo", GetFocusedAppInfo);
    Nan::SetPrototypeMethod(tpl, "injectTextViaClipboard", InjectTextViaClipboard);

    constructor().Reset(Nan::GetFunction(tpl).ToLocalChecked());
    Nan::Set(target, Nan::New("TextInjection").ToLocalChecked(),
             Nan::GetFunction(tpl).ToLocalChecked());
  }

 private:
  explicit TextInjection() {
    impl_ = new TextInjectionImpl();
  }

  ~TextInjection() {
    delete impl_;
  }

  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      TextInjection* obj = new TextInjection();
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      v8::Local<v8::Function> cons = Nan::New(constructor());
      info.GetReturnValue().Set(cons->NewInstance(
          Nan::GetCurrentContext()).ToLocalChecked());
    }
  }

  static NAN_METHOD(InjectText) {
    TextInjection* obj = ObjectWrap::Unwrap<TextInjection>(info.Holder());

    if (info.Length() < 1 || !info[0]->IsString()) {
      Nan::ThrowTypeError("Wrong arguments");
      return;
    }

    Nan::Utf8String text(info[0]);
    bool success = obj->impl_->InjectText(*text);

    info.GetReturnValue().Set(Nan::New(success));
  }

  static NAN_METHOD(GetFocusedAppInfo) {
    TextInjection* obj = ObjectWrap::Unwrap<TextInjection>(info.Holder());

    AppInfo appInfo = obj->impl_->GetFocusedAppInfo();

    Local<Object> result = Nan::New<Object>();
    Nan::Set(result, Nan::New("bundleId").ToLocalChecked(),
             Nan::New(appInfo.bundleId.c_str()).ToLocalChecked());
    Nan::Set(result, Nan::New("isTerminal").ToLocalChecked(),
             Nan::New(appInfo.isTerminal));
    Nan::Set(result, Nan::New("appName").ToLocalChecked(),
             Nan::New(appInfo.appName.c_str()).ToLocalChecked());

    info.GetReturnValue().Set(result);
  }

  static NAN_METHOD(InjectTextViaClipboard) {
    TextInjection* obj = ObjectWrap::Unwrap<TextInjection>(info.Holder());

    if (info.Length() < 1 || !info[0]->IsString()) {
      Nan::ThrowTypeError("Wrong arguments");
      return;
    }

    Nan::Utf8String text(info[0]);
    bool success = obj->impl_->InjectTextViaClipboard(*text);

    info.GetReturnValue().Set(Nan::New(success));
  }

  static inline Nan::Persistent<v8::Function>& constructor() {
    static Nan::Persistent<v8::Function> my_constructor;
    return my_constructor;
  }

  TextInjectionImpl* impl_;
};

NODE_MODULE(text_injection, TextInjection::Init)
