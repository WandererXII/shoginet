# Shoginet - Distributed Network for [lishogi.org](lishogi.org)

Based on [fairyfishnet](https://github.com/gbtami/fairyfishnet).

## How to setup

### Linux

You need to have both engines:

- YaneuraOu NNUE
- Fairy-Stockfish

To achieve this you can use the provided scripts - `build-yaneuraou.sh` for YaneuraOu and `build-fairy.sh` to build Fairy-Stockfish.
The scripts first clone [YaneuraOu github](https://github.com/yaneurao/YaneuraOu) or [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) and then run the `make`.

You can also try downloading YaneuraOu from https://github.com/yaneurao/YaneuraOu/actions using GitHub Actions artifacts.

You can also download Fairy-Stockfish from [https://fairy-stockfish.github.io/download/](https://fairy-stockfish.github.io/download/), make sure to pick 'all-variants'

To test that the engines work on you machine just run the engine `./YaneuraOu-by-gcc`(adjust command if necessary). and then enter the following commands:

```
usi
isready
position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f
go
```

If the engine didn't crash and you got some response, it looks like ti works. Yeah! Now test `./fairy-stockfish-largeboard_x86-64` in the same way.

If you have YaneuraOu and Fairy-Stockfish ready and python3 installed just run `python3 ./shoginet.py`, it will ask you about what working directory you want to use, path to the engine and similar things, leaving everything default should be fine.

Currently no key is required.
If you want to go over this setup step again, just delete shoginet.ini.

### Windows

Windows is not supported right now. Although almost everything should be fine. You will obviously have to compile YaneuraOu for windows and provide the correct path, when shoginet.py asks you the first time.

## How it works

Every once in a while shoginet running on your computer asks lishogi.org for some work. If someone requested analysis of their game on lishogi.org, you may receive this work. The work is a simple json containing mainly the initial position and sequence of moves. You then run engine analysis on these data and send the results back to lishogi.org.
