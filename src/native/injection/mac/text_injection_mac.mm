#include "../text_injection_impl.h"
#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>

// Check if bundle ID is a terminal (simplified, no static set)
static bool IsTerminalBundleId(NSString* bundleId) {
  if (!bundleId) return false;

  static NSString* const terminalIds[] = {
    @"com.apple.Terminal",
    @"com.googlecode.iterm2",
    @"dev.warp.Warp",
    @"org.alacritty",
    @"org.wezfurlong.wezterm",
    @"net.kovidgoyal.kitty",
    @"org.tabby",
    @"co.zeit.hyper",
    @"com.microsoft.VSCode",
    @"com.jetbrains.JetBrainsRider",
    @"com.jetbrains.intellij",
    @"com.jetbrains.WebStorm",
    @"com.jetbrains.PyCharm",
    @"com.jetbrains.CLion",
    @"com.jetbrains.AppCode",
    @"com.jetbrains.GoLand",
    @"com.jetbrains.RubyMine",
    @"com.jetbrains.datagrip",
    @"com.mitchellh.terminal",
    @"com.msolution.tab",
    @"com.vandyke.SecureCRT",
    @"org.putty.putty",
    nil
  };

  for (int i = 0; terminalIds[i] != nil; i++) {
    if ([bundleId isEqualToString:terminalIds[i]]) {
      return true;
    }
  }
  return false;
}

class TextInjectionImpl::Impl {
 public:
  Impl() {}

  ~Impl() {}

  bool InjectText(const std::string& text) {
    @autoreleasepool {
      @try {
        NSString* nsText = [NSString stringWithUTF8String:text.c_str()];
        if (!nsText) {
          return false;
        }

        // Get the currently focused application and element
        NSWorkspace* workspace = [NSWorkspace sharedWorkspace];
        if (!workspace) {
          return false;
        }

        NSRunningApplication* frontmostApp = [workspace frontmostApplication];
        if (!frontmostApp) {
          return false;
        }

        AXUIElementRef focusedApp = AXUIElementCreateApplication(frontmostApp.processIdentifier);

        if (!focusedApp) {
          return false;
        }

        // Get the focused element
        AXUIElementRef focusedElement = nullptr;
        AXError error = AXUIElementCopyAttributeValue(
            focusedApp,
            kAXFocusedUIElementAttribute,
            (CFTypeRef*)&focusedElement);

        if (error != kAXErrorSuccess || !focusedElement) {
          CFRelease(focusedApp);
          if (focusedElement) CFRelease(focusedElement);
          return false;
        }

        // Method 1: Replace selected text if supported (preserves cursor and formatting)
        bool success = false;

        Boolean canSetSelectedText = false;
        CFRange beforeRange = {0, 0};
        bool hasBeforeRange = false;
        AXValueRef beforeRangeValue = nullptr;

        if (AXUIElementIsAttributeSettable(focusedElement, kAXSelectedTextAttribute, &canSetSelectedText) ==
                kAXErrorSuccess &&
            canSetSelectedText) {
          AXError rangeError = AXUIElementCopyAttributeValue(
              focusedElement,
              kAXSelectedTextRangeAttribute,
              (CFTypeRef*)&beforeRangeValue);
          if (rangeError == kAXErrorSuccess && beforeRangeValue &&
              AXValueGetType(beforeRangeValue) == kAXValueTypeCFRange) {
            hasBeforeRange = AXValueGetValue(beforeRangeValue, kAXValueTypeCFRange, &beforeRange);
          }

          error = AXUIElementSetAttributeValue(focusedElement, kAXSelectedTextAttribute, (__bridge CFTypeRef)nsText);
          success = (error == kAXErrorSuccess);

          if (success && hasBeforeRange) {
            AXValueRef afterRangeValue = nullptr;
            CFRange afterRange = {0, 0};
            bool hasAfterRange = false;
            AXError afterError = AXUIElementCopyAttributeValue(
                focusedElement,
                kAXSelectedTextRangeAttribute,
                (CFTypeRef*)&afterRangeValue);
            if (afterError == kAXErrorSuccess && afterRangeValue &&
                AXValueGetType(afterRangeValue) == kAXValueTypeCFRange) {
              hasAfterRange = AXValueGetValue(afterRangeValue, kAXValueTypeCFRange, &afterRange);
            }

            if (hasAfterRange &&
                beforeRange.location == afterRange.location &&
                beforeRange.length == afterRange.length) {
              // Likely ignored by the target app; allow fallback injection.
              success = false;
            }

            if (afterRangeValue) CFRelease(afterRangeValue);
          }
        }
        if (beforeRangeValue) CFRelease(beforeRangeValue);

        // Method 2: If Accessibility editing failed, use clipboard paste
        if (!success) {
          success = InjectTextViaClipboard(text);
        }

        // Method 3: If clipboard paste failed, use CGEvent keyboard simulation
        if (!success) {
          success = SimulateTyping(nsText);
        }

        CFRelease(focusedElement);
        CFRelease(focusedApp);

        return success;
      } @catch (NSException* exception) {
        NSLog(@"Exception in InjectText: %@", exception.reason);
        return false;
      }
    }
  }

  AppInfo GetFocusedAppInfo() {
    AppInfo info;
    info.bundleId = "";
    info.isTerminal = false;
    info.appName = "";

    @autoreleasepool {
      NSWorkspace* workspace = [NSWorkspace sharedWorkspace];
      if (!workspace) {
        return info;
      }

      NSRunningApplication* frontmostApp = [workspace frontmostApplication];
      if (!frontmostApp) {
        return info;
      }

      // Get bundle ID
      @try {
        NSString* bundleId = [frontmostApp bundleIdentifier];
        if (bundleId && [bundleId length] > 0) {
          const char* utf8Str = [bundleId UTF8String];
          if (utf8Str) {
            info.bundleId = std::string(utf8Str);
          }
        }

        // Get app name
        NSString* appName = [frontmostApp localizedName];
        if (appName && [appName length] > 0) {
          const char* utf8Str = [appName UTF8String];
          if (utf8Str) {
            info.appName = std::string(utf8Str);
          }
        }

        // Check if it's a terminal
        info.isTerminal = IsTerminalBundleId(bundleId);
      } @catch (NSException* exception) {
        // If there's any exception, return default info
        NSLog(@"Exception in GetFocusedAppInfo: %@", exception.reason);
      }
    }

    return info;
  }

  bool InjectTextViaClipboard(const std::string& text) {
    @autoreleasepool {
      @try {
        NSString* nsText = [NSString stringWithUTF8String:text.c_str()];
        if (!nsText) {
          return false;
        }

        NSPasteboard* pasteboard = [NSPasteboard generalPasteboard];
        if (!pasteboard) {
          return false;
        }

        // Save current clipboard content as a string
        NSString* originalClipboard = [pasteboard stringForType:NSPasteboardTypeString];
        BOOL hadOriginalContent = (originalClipboard != nil && [originalClipboard length] > 0);

        // Copy text to clipboard
        [pasteboard clearContents];
        BOOL copySuccess = [pasteboard setString:nsText forType:NSPasteboardTypeString];

        if (!copySuccess) {
          // Try to restore clipboard if we had content
          if (hadOriginalContent) {
            [pasteboard setString:originalClipboard forType:NSPasteboardTypeString];
          }
          return false;
        }

        // Small delay to ensure clipboard is updated
        usleep(50000);  // 50ms

        // Simulate Cmd+V
        CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, kVK_Command, true);
        CGEventRef keyVDown = CGEventCreateKeyboardEvent(NULL, kVK_ANSI_V, true);
        CGEventRef keyVUp = CGEventCreateKeyboardEvent(NULL, kVK_ANSI_V, false);
        CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, kVK_Command, false);

        if (keyDown && keyVDown && keyVUp && keyUp) {
          CGEventSetFlags(keyVDown, kCGEventFlagMaskCommand);
          CGEventPost(kCGSessionEventTap, keyDown);
          CGEventPost(kCGSessionEventTap, keyVDown);
          CGEventPost(kCGSessionEventTap, keyVUp);
          CGEventPost(kCGSessionEventTap, keyUp);

          CFRelease(keyDown);
          CFRelease(keyVDown);
          CFRelease(keyVUp);
          CFRelease(keyUp);
        } else {
          // Clean up events if any were created
          if (keyDown) CFRelease(keyDown);
          if (keyVDown) CFRelease(keyVDown);
          if (keyVUp) CFRelease(keyVUp);
          if (keyUp) CFRelease(keyUp);
        }

        // Wait for paste to complete
        usleep(100000);  // 100ms

        // Restore original clipboard content if we had any
        if (hadOriginalContent) {
          [pasteboard clearContents];
          [pasteboard setString:originalClipboard forType:NSPasteboardTypeString];
        }

        return true;
      } @catch (NSException* exception) {
        NSLog(@"Exception in InjectTextViaClipboard: %@", exception.reason);
        return false;
      }
    }
  }

 private:
  bool SimulateTyping(NSString* text) {
    @autoreleasepool {
      // Convert string to key events
      for (NSUInteger i = 0; i < text.length; i++) {
        unichar ch = [text characterAtIndex:i];

        // Generate key events for each character
        CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, 0, true);
        CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, 0, false);

        if (keyDown && keyUp) {
          // Set the Unicode value
          CGEventKeyboardSetUnicodeString(keyDown, 1, &ch);
          CGEventKeyboardSetUnicodeString(keyUp, 1, &ch);

          // Post to the current event tap location
          CGEventPost(kCGSessionEventTap, keyDown);
          CGEventPost(kCGSessionEventTap, keyUp);

          CFRelease(keyDown);
          CFRelease(keyUp);

          // Small delay between keystrokes
          usleep(1000);  // 1ms
        }
      }

      return true;
    }
  }
};

TextInjectionImpl::TextInjectionImpl() : impl_(new Impl()) {}

TextInjectionImpl::~TextInjectionImpl() = default;

bool TextInjectionImpl::InjectText(const std::string& text) {
  return impl_->InjectText(text);
}

AppInfo TextInjectionImpl::GetFocusedAppInfo() {
  return impl_->GetFocusedAppInfo();
}

bool TextInjectionImpl::InjectTextViaClipboard(const std::string& text) {
  return impl_->InjectTextViaClipboard(text);
}
