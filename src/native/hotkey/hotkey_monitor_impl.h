#ifndef HOTKEY_MONITOR_IMPL_H
#define HOTKEY_MONITOR_IMPL_H

#include <nan.h>
#include <memory>
#include <functional>

// Forward declaration
class HotkeyMonitor;

class HotkeyMonitorImpl {
 public:
  // Callback types
  using CommandCallback = std::function<void()>;

  explicit HotkeyMonitorImpl(CommandCallback on_down, CommandCallback on_up, CommandCallback on_quick_press);
  ~HotkeyMonitorImpl();

  void Start();
  void Stop();

  // Permission checking methods (macOS only)
  static bool CheckAccessibilityPermission();
  static void RequestAccessibilityPermission();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
  CommandCallback on_command_down_;
  CommandCallback on_command_up_;
  CommandCallback on_command_quick_press_;
};

#endif  // HOTKEY_MONITOR_IMPL_H
