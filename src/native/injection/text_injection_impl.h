#ifndef TEXT_INJECTION_IMPL_H
#define TEXT_INJECTION_IMPL_H

#include <string>

class TextInjectionImpl {
 public:
  TextInjectionImpl();
  ~TextInjectionImpl();

  bool InjectText(const std::string& text);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

#endif  // TEXT_INJECTION_IMPL_H
