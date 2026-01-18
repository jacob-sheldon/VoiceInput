#include "../hotkey_monitor_impl.h"
#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>
#include <uv.h>
#include <cstdio>
#include <chrono>

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
  Impl(HotkeyMonitorImpl* outer) : outer_(outer), event_monitor_(nil), was_command_pressed_(false),
      pending_command_down_(false), pending_command_up_(false), pending_command_quick_press_(false),
      command_press_start_time_(0), command_hold_threshold_ms_(200) {
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
          // Command key just pressed - record the time
          printf("[Hotkey] Command down, recording press time\n"); fflush(stdout);
          outer_->impl_->command_press_start_time_ = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
          outer_->impl_->was_command_pressed_ = true;
        } else if (!commandPressed && outer_->impl_->was_command_pressed_) {
          // Command key just released - check if it was a quick press
          printf("[Hotkey] Command up, checking press duration\n"); fflush(stdout);
          auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
          auto press_duration = now - outer_->impl_->command_press_start_time_;

          if (press_duration < outer_->impl_->command_hold_threshold_ms_) {
            // This was a quick press - send quick-press event
            printf("[Hotkey] Quick press detected (%lld ms), sending quick-press signal\n", press_duration); fflush(stdout);
            outer_->impl_->pending_command_quick_press_ = true;
            uv_async_send(&outer_->impl_->async_);
          }

          outer_->impl_->was_command_pressed_ = false;
          printf("[Hotkey] Async signal sent\n"); fflush(stdout);
        }
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

    printf("[Hotkey] Async callback: down=%d, up=%d, quick_press=%d\n", impl->pending_command_down_, impl->pending_command_up_, impl->pending_command_quick_press_); fflush(stdout);

    if (impl->pending_command_quick_press_) {
      printf("[Hotkey] Calling on_command_quick_press_ callback\n"); fflush(stdout);
      if (impl->outer_->on_command_quick_press_) {
        impl->outer_->on_command_quick_press_();
      }
      impl->pending_command_quick_press_ = false;
      printf("[Hotkey] on_command_quick_press_ returned\n"); fflush(stdout);
    }

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
  bool pending_command_quick_press_;
  int64_t command_press_start_time_;
  int command_hold_threshold_ms_;
  uv_async_t async_;
};

HotkeyMonitorImpl::HotkeyMonitorImpl(CommandCallback on_down, CommandCallback on_up, CommandCallback on_quick_press)
    : on_command_down_(on_down), on_command_up_(on_up), on_command_quick_press_(on_quick_press), impl_(new Impl(this)) {
  printf("[Hotkey] HotkeyMonitorImpl constructor called\n"); fflush(stdout);
}

HotkeyMonitorImpl::~HotkeyMonitorImpl() = default;

void HotkeyMonitorImpl::Start() {
  impl_->Start();
}

void HotkeyMonitorImpl::Stop() {
  impl_->Stop();
}
