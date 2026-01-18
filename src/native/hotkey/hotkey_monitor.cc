#include <nan.h>
#include "hotkey_monitor_impl.h"

using namespace v8;

class HotkeyMonitor : public Nan::ObjectWrap {
 public:
  static NAN_MODULE_INIT(Init) {
    v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
    tpl->SetClassName(Nan::New("HotkeyMonitor").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(tpl, "start", Start);
    Nan::SetPrototypeMethod(tpl, "stop", Stop);
    Nan::SetPrototypeMethod(tpl, "on", On);

    constructor().Reset(Nan::GetFunction(tpl).ToLocalChecked());
    Nan::Set(target, Nan::New("HotkeyMonitor").ToLocalChecked(),
             Nan::GetFunction(tpl).ToLocalChecked());

    // Expose static permission checking methods on the class
    v8::Local<v8::Function> constructorFunc = Nan::GetFunction(tpl).ToLocalChecked();
    Nan::SetMethod(constructorFunc, "checkAccessibilityPermission", CheckAccessibilityPermission);
    Nan::SetMethod(constructorFunc, "requestAccessibilityPermission", RequestAccessibilityPermission);
  }

 private:
  explicit HotkeyMonitor() {
    // Capture 'this' and pass lambdas to impl
    impl_ = new HotkeyMonitorImpl(
      [this]() { this->NotifyCommandDown(); },
      [this]() { this->NotifyCommandUp(); },
      [this]() { this->NotifyCommandQuickPress(); }
    );
  }

  ~HotkeyMonitor() {
    delete impl_;
  }

  // Called from native impl when command key is pressed
  void NotifyCommandDown() {
    printf("[Hotkey] NotifyCommandDown called\n"); fflush(stdout);
    if (command_down_cb_) {
      printf("[Hotkey] Calling JS callback\n"); fflush(stdout);
      Nan::HandleScope scope;
      v8::Isolate* isolate = v8::Isolate::GetCurrent();
      v8::Local<v8::Context> context = isolate->GetCurrentContext();

      // CRITICAL: Enter the context scope before calling JS
      v8::Context::Scope context_scope(context);
      printf("[Hotkey] Context scope entered\n"); fflush(stdout);

      v8::Local<v8::Function> js_func = command_down_cb_->GetFunction();
      printf("[Hotkey] Got function\n"); fflush(stdout);

      if (!js_func->IsFunction()) {
        printf("[Hotkey] ERROR: Not a function!\n"); fflush(stdout);
        return;
      }

      v8::TryCatch trycatch(isolate);
      printf("[Hotkey] Calling function\n"); fflush(stdout);

      v8::MaybeLocal<v8::Value> result = js_func->Call(
        context,
        v8::Null(isolate),
        0,
        nullptr
      );

      if (trycatch.HasCaught()) {
        printf("[Hotkey] EXCEPTION in JS callback!\n"); fflush(stdout);
        trycatch.Reset();
      } else {
        printf("[Hotkey] JS callback returned\n"); fflush(stdout);
      }
    }
  }

  // Called from native impl when command key is released
  void NotifyCommandUp() {
    printf("[Hotkey] NotifyCommandUp called\n"); fflush(stdout);
    if (command_up_cb_) {
      printf("[Hotkey] Calling JS callback\n"); fflush(stdout);
      Nan::HandleScope scope;
      v8::Isolate* isolate = v8::Isolate::GetCurrent();
      v8::Local<v8::Context> context = isolate->GetCurrentContext();

      // CRITICAL: Enter the context scope before calling JS
      v8::Context::Scope context_scope(context);
      printf("[Hotkey] Context scope entered\n"); fflush(stdout);

      v8::Local<v8::Function> js_func = command_up_cb_->GetFunction();
      printf("[Hotkey] Got function\n"); fflush(stdout);

      if (!js_func->IsFunction()) {
        printf("[Hotkey] ERROR: Not a function!\n"); fflush(stdout);
        return;
      }

      v8::TryCatch trycatch(isolate);
      printf("[Hotkey] Calling function\n"); fflush(stdout);

      v8::MaybeLocal<v8::Value> result = js_func->Call(
        context,
        v8::Null(isolate),
        0,
        nullptr
      );

      if (trycatch.HasCaught()) {
        printf("[Hotkey] EXCEPTION in JS callback!\n"); fflush(stdout);
        trycatch.Reset();
      } else {
        printf("[Hotkey] JS callback returned\n"); fflush(stdout);
      }
    }
  }

  // Called from native impl when command key is quickly pressed
  void NotifyCommandQuickPress() {
    printf("[Hotkey] NotifyCommandQuickPress called\n"); fflush(stdout);
    if (command_quick_press_cb_) {
      printf("[Hotkey] Calling JS callback\n"); fflush(stdout);
      Nan::HandleScope scope;
      v8::Isolate* isolate = v8::Isolate::GetCurrent();
      v8::Local<v8::Context> context = isolate->GetCurrentContext();

      // CRITICAL: Enter the context scope before calling JS
      v8::Context::Scope context_scope(context);
      printf("[Hotkey] Context scope entered\n"); fflush(stdout);

      v8::Local<v8::Function> js_func = command_quick_press_cb_->GetFunction();
      printf("[Hotkey] Got function\n"); fflush(stdout);

      if (!js_func->IsFunction()) {
        printf("[Hotkey] ERROR: Not a function!\n"); fflush(stdout);
        return;
      }

      v8::TryCatch trycatch(isolate);
      printf("[Hotkey] Calling function\n"); fflush(stdout);

      v8::MaybeLocal<v8::Value> result = js_func->Call(
        context,
        v8::Null(isolate),
        0,
        nullptr
      );

      if (trycatch.HasCaught()) {
        printf("[Hotkey] EXCEPTION in JS callback!\n"); fflush(stdout);
        trycatch.Reset();
      } else {
        printf("[Hotkey] JS callback returned\n"); fflush(stdout);
      }
    }
  }

  static NAN_METHOD(New) {
    if (info.IsConstructCall()) {
      HotkeyMonitor* obj = new HotkeyMonitor();
      obj->Wrap(info.This());
      info.GetReturnValue().Set(info.This());
    } else {
      v8::Local<v8::Function> cons = Nan::New(constructor());
      info.GetReturnValue().Set(cons->NewInstance(
          Nan::GetCurrentContext()).ToLocalChecked());
    }
  }

  static NAN_METHOD(Start) {
    HotkeyMonitor* obj = ObjectWrap::Unwrap<HotkeyMonitor>(info.Holder());
    obj->impl_->Start();
    info.GetReturnValue().SetUndefined();
  }

  static NAN_METHOD(Stop) {
    HotkeyMonitor* obj = ObjectWrap::Unwrap<HotkeyMonitor>(info.Holder());
    obj->impl_->Stop();
    info.GetReturnValue().SetUndefined();
  }

  static NAN_METHOD(On) {
    HotkeyMonitor* obj = ObjectWrap::Unwrap<HotkeyMonitor>(info.Holder());

    if (info.Length() < 2 || !info[0]->IsString() || !info[1]->IsFunction()) {
      Nan::ThrowTypeError("Wrong arguments");
      return;
    }

    Nan::Utf8String event(info[0]);

    if (strcmp(*event, "command-down") == 0) {
      obj->command_down_cb_.reset(new Nan::Callback(info[1].As<v8::Function>()));
      printf("[Hotkey] command-down callback registered\n"); fflush(stdout);
    } else if (strcmp(*event, "command-up") == 0) {
      obj->command_up_cb_.reset(new Nan::Callback(info[1].As<v8::Function>()));
      printf("[Hotkey] command-up callback registered\n"); fflush(stdout);
    } else if (strcmp(*event, "command-quick-press") == 0) {
      obj->command_quick_press_cb_.reset(new Nan::Callback(info[1].As<v8::Function>()));
      printf("[Hotkey] command-quick-press callback registered\n"); fflush(stdout);
    }

    info.GetReturnValue().SetUndefined();
  }

  // Static method to check accessibility permission
  static NAN_METHOD(CheckAccessibilityPermission) {
    bool hasPermission = HotkeyMonitorImpl::CheckAccessibilityPermission();
    info.GetReturnValue().Set(Nan::New(hasPermission));
  }

  // Static method to request accessibility permission (opens System Settings)
  static NAN_METHOD(RequestAccessibilityPermission) {
    HotkeyMonitorImpl::RequestAccessibilityPermission();
    info.GetReturnValue().SetUndefined();
  }

  static inline Nan::Persistent<v8::Function>& constructor() {
    static Nan::Persistent<v8::Function> my_constructor;
    return my_constructor;
  }

  HotkeyMonitorImpl* impl_;
  std::unique_ptr<Nan::Callback> command_down_cb_;
  std::unique_ptr<Nan::Callback> command_up_cb_;
  std::unique_ptr<Nan::Callback> command_quick_press_cb_;
};

NODE_MODULE(hotkey_monitor, HotkeyMonitor::Init)
