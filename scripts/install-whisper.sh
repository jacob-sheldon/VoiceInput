#!/bin/bash

set -e

# Save the original directory
ORIGINAL_DIR="$(pwd)"
WHISPER_DIR="$(pwd)/native-deps/whisper.cpp"
INSTALL_PREFIX="$WHISPER_DIR/install"

echo "Installing whisper.cpp..."

# Clone whisper.cpp if not exists
if [ ! -d "$WHISPER_DIR" ]; then
    echo "Cloning whisper.cpp repository..."
    mkdir -p native-deps
    cd native-deps
    git clone https://github.com/ggml-org/whisper.cpp.git
    cd ..
fi

cd "$WHISPER_DIR"

# Build whisper.cpp
echo "Building whisper.cpp..."
mkdir -p build
cd build

cmake -DCMAKE_BUILD_TYPE=Release \
      -DWHISPER_BUILD_TESTS=OFF \
      -DWHISPER_BUILD_EXAMPLES=ON \
      -DCMAKE_INSTALL_RPATH="@executable_path/../src;@executable_path/../ggml/src;@executable_path/../ggml/src/ggml-blas;@executable_path/../ggml/src/ggml-metal" \
      -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON \
      ..

make -j$(sysctl -n hw.ncpu)

echo "whisper.cpp built successfully!"
echo "Binary location: $WHISPER_DIR/build/bin/whisper-cli"

# Return to project root
cd "$ORIGINAL_DIR"
