#include "../hotkey_monitor_impl.h"
#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>
#include <uv.h>
#include <cstdio>

// Static permission checking methods
bool HotkeyMonitorImpl::CheckAccessibilityPermission() {
  return AXIsProcessTrustedWithOptions(nullptr);
}

void HotkeyMonitorImpl::RequestAccessibilityPermission() {
  // Create options to prompt for accessibility permission
  CFStringRef keys[] = { kAXTrustedCheckOptionPrompt };
  CFBooleanRef values[] = { kCFBooleanTrue };
  CFDictionaryRef options = CFDictionaryCreate(
      nullptr,
      (const void**)keys,
      (const void**)values,
      1,
      &kCFCopyStringDictionaryKeyCallBacks,
      &kCFTypeDictionaryValueCallBacks);

  // This will show the system dialog and open System Preferences
  AXIsProcessTrustedWithOptions(options);

  CFRelease(options);
}

class HotkeyMonitorImpl::Impl {
 public:
  Impl(HotkeyMonitorImpl* outer) : outer_(outer), event_monitor_(nil), was_command_pressed_(false), pending_command_down_(false), pending_command_up_(false) {
    printf("[Hotkey] Impl constructor called\n"); fflush(stdout);
    uv_loop_t* loop = uv_default_loop();
    printf("[Hotkey] Got uv loop: %p\n", loop); fflush(stdout);
    int result = uv_async_init(loop, &async_, AsyncCallback);
    printf("[Hotkey] uv_async_init result: %d\n", result); fflush(stdout);
    async_.data = this;
    printf("[Hotkey] Impl constructor complete\n"); fflush(stdout);
  }

  ~Impl() {
    Stop();
    uv_close(reinterpret_cast<uv_handle_t*>(&async_), nullptr);
  }

  void Start() {
    printf("[Hotkey] Start() called\n"); fflush(stdout);
    if (event_monitor_) {
      printf("[Hotkey] Already started, returning\n"); fflush(stdout);
      return;
    }

    printf("[Hotkey] outer_=%p\n", outer_); fflush(stdout);

    event_monitor_ = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged
      handler:^(NSEvent* event) {
        printf("[Hotkey] Event triggered\n"); fflush(stdout);
        NSUInteger flags = [event modifierFlags];
        bool commandPressed = (flags & NSEventModifierFlagCommand) != 0;

        printf("[Hotkey] commandPressed=%d, was_pressed=%d\n", commandPressed, outer_->impl_->was_command_pressed_); fflush(stdout);

        if (commandPressed && !outer_->impl_->was_command_pressed_) {
          // Command key just pressed - signal main thread
          printf("[Hotkey] Command down, sending async signal\n"); fflush(stdout);
          outer_->impl_->pending_command_down_ = true;
          uv_async_send(&outer_->impl_->async_);
          printf("[Hotkey] Async signal sent\n"); fflush(stdout);
        } else if (!commandPressed && outer_->impl_->was_command_pressed_) {
          // Command key just released - signal main thread
          printf("[Hotkey] Command up, sending async signal\n"); fflush(stdout);
          outer_->impl_->pending_command_up_ = true;
          uv_async_send(&outer_->impl_->async_);
          printf("[Hotkey] Async signal sent\n"); fflush(stdout);
        }

        outer_->impl_->was_command_pressed_ = commandPressed;
      }
    ];
    printf("[Hotkey] Event monitor installed: %p\n", event_monitor_); fflush(stdout);
  }

  void Stop() {
    if (event_monitor_) {
      [NSEvent removeMonitor:event_monitor_];
      event_monitor_ = nil;
    }
  }

  static void AsyncCallback(uv_async_t* handle) {
    printf("[Hotkey] AsyncCallback ENTER\n"); fflush(stdout);

    if (!handle) {
      printf("[Hotkey] Async callback: handle is null\n"); fflush(stdout);
      return;
    }

    printf("[Hotkey] handle=%p, handle->data=%p\n", handle, handle->data); fflush(stdout);

    Impl* impl = static_cast<Impl*>(handle->data);
    if (!impl) {
      printf("[Hotkey] Async callback: impl is null\n"); fflush(stdout);
      return;
    }

    printf("[Hotkey] Async callback: down=%d, up=%d\n", impl->pending_command_down_, impl->pending_command_up_); fflush(stdout);

    if (impl->pending_command_down_) {
      printf("[Hotkey] Calling on_command_down_ callback\n"); fflush(stdout);
      if (impl->outer_->on_command_down_) {
        impl->outer_->on_command_down_();
      }
      impl->pending_command_down_ = false;
      printf("[Hotkey] on_command_down_ returned\n"); fflush(stdout);
    }

    if (impl->pending_command_up_) {
      printf("[Hotkey] Calling on_command_up_ callback\n"); fflush(stdout);
      if (impl->outer_->on_command_up_) {
        impl->outer_->on_command_up_();
      }
      impl->pending_command_up_ = false;
      printf("[Hotkey] on_command_up_ returned\n"); fflush(stdout);
    }

    printf("[Hotkey] Async callback complete\n"); fflush(stdout);
  }

  HotkeyMonitorImpl* outer_;
  id event_monitor_;
  bool was_command_pressed_;
  bool pending_command_down_;
  bool pending_command_up_;
  uv_async_t async_;
};

HotkeyMonitorImpl::HotkeyMonitorImpl(CommandCallback on_down, CommandCallback on_up)
    : on_command_down_(on_down), on_command_up_(on_up), impl_(new Impl(this)) {
  printf("[Hotkey] HotkeyMonitorImpl constructor called\n"); fflush(stdout);
}

HotkeyMonitorImpl::~HotkeyMonitorImpl() = default;

void HotkeyMonitorImpl::Start() {
  impl_->Start();
}

void HotkeyMonitorImpl::Stop() {
  impl_->Stop();
}
