#!/bin/sh

echo "- Getting latest YaneuraOu..."

cd engines

if [ -d YaneuraOu/source ]; then
    cd YaneuraOu/source
    make clean > /dev/null
    git pull
else
    git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git
    cd YaneuraOu/source
fi

echo "- Determining CPU architecture..."

ARCH=SSE42
COMP=g++

if grep -q avx2 /proc/cpuinfo 2>/dev/null || \
   (sysctl -a 2>/dev/null | grep machdep.cpu.leaf7_features | grep -q AVX2); then
  ARCH=AVX2
fi

distFile="YaneuraOu"

echo "- Building YANEURAOU $ARCH ... (patience advised)"

make -j$(nproc || echo 4) TARGET_CPU=$ARCH YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE COMPILER=$COMP > /dev/null

mv ./YaneuraOu-by-gcc ../../

echo "- Done!"
