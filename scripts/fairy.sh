#!/bin/sh

echo "- Getting latest Fairy-Stockfish ..."

cd engines

if [ -d Fairy-Stockfish/src ]; then
    cd Fairy-Stockfish/src
    make clean > /dev/null
    git pull
else
    git clone --depth 1 https://github.com/ianfab/Fairy-Stockfish.git
    cd Fairy-Stockfish/src
fi

echo "- Determining CPU architecture ..."

ARCH=x86-64
EXE=fairy-stockfish

if [ -f /proc/cpuinfo ]; then
    if grep "^flags" /proc/cpuinfo | grep -q popcnt ; then
        ARCH=x86-64-modern
    fi

    if grep "^vendor_id" /proc/cpuinfo | grep -q Intel ; then
        if grep "^flags" /proc/cpuinfo | grep bmi2 | grep -q popcnt ; then
            ARCH=x86-64-bmi2
        fi
    fi
fi

echo "- Building Fairy-stockfish $ARCH ... (patience advised)"
make -j$(nproc || echo 4) build ARCH=$ARCH EXE=../../$EXE largeboards=yes > /dev/null

echo "- Done!"