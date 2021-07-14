# Shoginet - Distributed Network for [lishogi.org](lishogi.org)

Based on [fairyfishnet](https://github.com/gbtami/fairyfishnet).

## How to setup

#### Linux

You need to have YaneuraOu for NNUE ready. To achieve this you can use the provided script `build-yaneuraou.sh`. The script first clones [YaneuraOu github](https://github.com/yaneurao/YaneuraOu) and then runs the make command either with avx2 or sse42 depending on your cpu.
You can also try using the provided precompiled 'YaneuraOu-by-gcc' for intel with avx2, if that works for you or build YaneuraOu with some script in YaneuraOu/script.
To test that engine works on you machine just run the engine `./YaneuraOu-by-gcc`.

```
usi
isready
```
after readyOk appears run:
`bench`
If the engine didn't crash, it probably works.

If you have YaneuraOu ready and python3 installed just run `python3 ./shoginet.py`, it will ask you about what working directory you want to use, path to the engine and similar things, leaving everything default should be fine. Currently no key is required.
If you want to go over this setup step again, just delete the `fishnet.ini`.

#### Windows

Shoginet should works on windows the same way it does on linux, though you require make a few small changes.

Firstly, you need to get YaneuraOu v6.0.0 with NNUE for windows, which you will find in [YaneuraOu's releases](https://github.com/yaneurao/YaneuraOu/releases). To test that engine works on you machine just run the engine `./YaneuraOu-*` (The name of the engine you downloaded). 
```
usi
isready
```
after `readyOk` appears run: 
```
bench
```
If the engine didn't crash, it probably works. Make sure to add the windows version of YaneuraOu that you have downloaded in the shoginet directory.

If you have YaneuraOu ready and python3 installed just run `python3 ./shoginet.py`, it will ask you about what working directory you want to use, path to the engine and similar things, leaving everything default should be fine, just provide the proper path the YaneuraOu engine that you have downloaded. Currently no key is required.

If you want to go over this setup step again, just delete the `fishnet.ini` file.

## How it works

Every once in a while shoginet running on your computer asks lishogi.org for some work. If someone requested analysis of their game on lishogi.org, you may receive this work. The work is a simple json containing mainly the initial position and sequence of moves. You then run engine analysis on these data and send the results back to lishogi.org.