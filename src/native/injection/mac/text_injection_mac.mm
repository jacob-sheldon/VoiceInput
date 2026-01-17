#include "../text_injection_impl.h"
#import <Cocoa/Cocoa.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>

class TextInjectionImpl::Impl {
 public:
  Impl() {}

  ~Impl() {}

  bool InjectText(const std::string& text) {
    @autoreleasepool {
      NSString* nsText = [NSString stringWithUTF8String:text.c_str()];
      if (!nsText) {
        return false;
      }

      // Get the currently focused application and element
      AXUIElementRef focusedApp = AXUIElementCreateApplication(
          [NSWorkspace sharedWorkspace].frontmostApplication.processIdentifier);

      if (!focusedApp) {
        CFRelease(focusedApp);
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

      // Method 1: Try to set the value directly (works for text fields)
      bool success = false;

      // First try: Direct value setting
      AXValueRef existingValue = nullptr;
      error = AXUIElementCopyAttributeValue(focusedElement, kAXValueAttribute, (CFTypeRef*)&existingValue);

      if (error == kAXErrorSuccess) {
        // Get current value
        id currentObj = (__bridge id)existingValue;
        NSString* currentText = @"";

        if ([currentObj isKindOfClass:[NSString class]]) {
          currentText = (NSString*)currentObj;
        }

        // Append new text
        NSString* newText = [currentText stringByAppendingString:nsText];

        // Set the new value directly (not using AXValue for NSString)
        error = AXUIElementSetAttributeValue(focusedElement, kAXValueAttribute, (__bridge CFTypeRef)newText);
        success = (error == kAXErrorSuccess);

        if (existingValue) CFRelease(existingValue);
      }

      // Method 2: If direct setting failed, use CGEvent keyboard simulation
      if (!success) {
        success = SimulateTyping(nsText);
      }

      CFRelease(focusedElement);
      CFRelease(focusedApp);

      return success;
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
