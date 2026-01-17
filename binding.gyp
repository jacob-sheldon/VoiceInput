{
  "targets": [
    {
      "target_name": "hotkey_monitor",
      "sources": [
        "src/native/hotkey/hotkey_monitor.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.13",
        "OTHER_CFLAGS": [
          "-x objective-c++"
        ]
      },
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "src/native/hotkey/mac/hotkey_monitor_mac.mm"
          ],
          "include_dirs": [
            "/System/Library/Frameworks/Carbon.framework/Frameworks"
          ],
          "libraries": [
            "-framework Carbon",
            "-framework Cocoa"
          ]
        }]
      ]
    },
    {
      "target_name": "text_injection",
      "sources": [
        "src/native/injection/text_injection.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.13",
        "OTHER_CFLAGS": [
          "-x objective-c++"
        ]
      },
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "src/native/injection/mac/text_injection_mac.mm"
          ],
          "libraries": [
            "-framework Carbon",
            "-framework Cocoa",
            "-framework ApplicationServices",
            "-framework CoreGraphics"
          ]
        }]
      ]
    },
    {
      "target_name": "audio_recorder",
      "sources": [
        "src/native/audio/audio_recorder.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.13",
        "OTHER_CFLAGS": [
          "-x objective-c++"
        ]
      },
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "src/native/audio/mac/audio_recorder_mac.mm"
          ],
          "libraries": [
            "-framework AVFoundation",
            "-framework Foundation",
            "-framework CoreAudio"
          ]
        }]
      ]
    }
  ]
}
