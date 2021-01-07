# Shoginet - Distributed Network for lishogi.org

Based on [fairyfishnet](https://github.com/gbtami/fairyfishnet).

## How to setup

#### Linux

You need to have YaneuraOu for NNUE ready. To achieve this you can use the provided script `build-yaneuraou.sh`. The script first clones [YaneuraOu github](https://github.com/yaneurao/YaneuraOu) and then runs the make command either with avx2 or sse42.
You can also try using the provided precompiled 'YaneuraOu-by-gcc' for intel with avx2, if that works for you or build with some script in YaneuraOu/script.
To test that engine works on you machine just run the engine `./YaneuraOu-by-gcc`.

```
usi
isready
```
after readyOk appears run:
`bench`

If you have YaneuraOu ready and python3 installed just run `python3 ./shoginet.py`, it will ask you about working directory, name of the engine and similar, leaving everything default should be fine. Currently no need key is required. If you want to go over this setup step again, just delete `fishnet.ini`

#### Windows

Not supported right now. Although almost everything should be fine. You will obviously have to compile YaneuraOu for windows and provide the correct path, when shoginet.py asks you the first time. 

## How it works

Every once in a while shoginet running on your computer asks lishogi.org for some work. If someone requested analysis of their game on lishogi.org, you may receive this work. The work is a simple json containing mainly the initial position and sequence of moves. You then run engine analysis on these data and send the results back to lishogi.org.
