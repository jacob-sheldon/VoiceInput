#ifndef TEXT_INJECTION_IMPL_H
#define TEXT_INJECTION_IMPL_H

#include <string>
#include <map>

struct AppInfo {
  std::string bundleId;
  bool isTerminal;
  std::string appName;
};

class TextInjectionImpl {
 public:
  TextInjectionImpl();
  ~TextInjectionImpl();

  bool InjectText(const std::string& text);
  AppInfo GetFocusedAppInfo();
  bool InjectTextViaClipboard(const std::string& text);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

#endif  // TEXT_INJECTION_IMPL_H
