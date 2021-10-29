# Shoginet - Distributed Network for [lishogi.org](https://lishogi.org/)

Based on [fairyfishnet](https://github.com/gbtami/fairyfishnet).

## How to setup

#### Linux

You need to have Fairy Stockfish largeboards for linux ready. To achieve this you can use the provided script `build-stockfish.sh`. The script first clones [Fairy Stockfish github](https://github.com/ianfab/Fairy-Stockfish) and then runs the make command either with popcnt or bmi2 depending on your cpu. You can also try using the provided precompiled 'fairy-stockfish-largeboards' for intel with bmi2, if that works for you or you can [compile Fairy Stockfish largeboards seperately](https://github.com/ianfab/Fairy-Stockfish/wiki/Compiling-Fairy-Stockfish) or download Fairy Stockfish largeboards from the [latest release](https://github.com/ianfab/Fairy-Stockfish/releases).
To test that engine works on you machine just run the engine `./fairy-stockfish-largeboards`.

```
usi
isready
```
after readyOk appears run:
`bench`
If the engine didn't crash, it probably works.

If you have Fairy Stockfish largeboards ready and python3 installed just run,
```
pip install -r requirements.txt
python ./shoginet.py
```
It will ask you about what working directory you want to use, path to the engine and similar things, leaving everything default should be fine. Currently no key is required.

If you want to go over this setup step again, just delete the `fishnet.ini` file.

#### Windows

Shoginet should works on windows the same way it does on linux, though you require make a few small changes.

Firstly, you need to get Fairy Stockfish largeboards for windows, which you will find in [Fairy Stockfish's releases](https://github.com/ianfab/Fairy-Stockfish/releases). You can also try using the provided precompiled 'fairy-stockfish-largeboards.exe' for intel with bmi2, if that works for you or [compile Fairy Stockfish largeboards seperately](https://github.com/ianfab/Fairy-Stockfish/wiki/Compiling-Fairy-Stockfish). To test that engine works on your machine just run the engine `\fairy-stockfish-largeboards.exe`. 
```
usi
isready
```
after `readyOk` appears run: 
```
bench
```
If the engine didn't crash, it probably works. Make sure to add the windows version of Fairy Stockfish largeboards that you have downloaded in the shoginet directory.

If you have Fairy Stockfish largeboards ready and python3 installed just run,
```
pip install -r requirements.txt
python shoginet.py
```
It will ask you about what working directory you want to use, path to the engine and similar things, leaving everything default should be fine. Currently no key is required.

If you want to go over this setup step again, just delete the `fishnet.ini` file.

## How it works

Every once in a while shoginet running on your computer asks [lishogi.org](https://lishogi.org/) for some work. If someone requested analysis of their game on [lishogi.org](https://lishogi.org/), you may receive this work. The work is a simple json containing mainly the initial position and sequence of moves. You then run engine analysis on these data and send the results back to [lishogi.org](https://lishogi.org/).