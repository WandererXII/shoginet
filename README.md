# Shoginet

[![lishogi.org](https://img.shields.io/badge/☗_lishogi.org-Play_shogi-black)](https://lishogi.org)

**Distributed network for [Lishogi.org](https://lishogi.org)**

## Installation

```console
git clone https://github.com/WandererXII/shoginet.git
cd shoginet
npm install
```

**Note:** You must obtain and install engines **before** running Shoginet:

* **Linux - from source:** Use `./scripts/yaneuraou.sh` and `./scripts/fairy.sh` to download and build engines yourself. Make sure you have a C/C++ compiler and build tools installed. It will take a few minutes per engine.
* **Ready to use binary:** Make sure to download the correct version for your OS and CPU. 
  - YaneuraOu - [YaneuraOu repo releases](https://github.com/yaneurao/YaneuraOu/releases)
  - Fairy Stockfish - [Fairy Stockfish website](https://fairy-stockfish.github.io/download/), download largeboard (all variants) version

Do not forget to check if path to engines is correct set (next step)

## Configuration

Configuration is stored in `config` directory. Write your own overrides to `local.json`.

Most importantly you want to make sure that engine path is correctly set. By default we look into `engines` directory. _Yaneuraou_ engine default name is `YaneuraOu-by-gcc` and _Fairy Stockfish_ default name is `fairy-stockfish`

## Usage

**Run tests first** to make sure everything works, especially the engines:

```console
npm run test
```

If tests pass successfully, you can start Shoginet directly by running:

```console
npm run start
```

You will probably want to run Shoginet with a process manager. For systemd (Linux) integration:

```console
node ./scripts/systemd.js > /etc/systemd/system/shoginet.service
sudo systemctl daemon-reload
sudo systemctl start shoginet
```

## Shoginet workflow

1. **Start!**
   - Shoginet is initiated and fetches config from the server. The config sets parameters for move generation, analysis and puzzle verification.

2. **Request work**
   - Shoginet -> Lishogi: "Give me work!"

3. **Receive work**
   - Lishogi -> Shoginet: "Here's a game to analyse"
   - The work could be _analysis_, _move generation_ or _puzle verification_. Or nothing, if the queue is empty.

4. **Process work**
   - Shoginet is analyzing the game...
   - This consumes CPU

5. **Submit Results**
   - Shoginet -> Lishogi: "Here are the analysis result"

6. **Repeat**
   - Lishogi -> Shoginet: "Thanks, here's more work :)"
   - Rinse & repeat

7. **Stop**
   - Stop Shoginet when you need CPU power. Shoginet will try to finish the work in progress and only then exit, if you wish to abort immediately press CTRL^C again.
