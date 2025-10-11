# Shoginet

**Distributed network for [Lishogi.org](https://lishogi.org)**

## Installation

```bash
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

Most importantly you want to make sure that engine path is correctly set. By default we look into `engines` directory. _Yaneuraou_ engine default name is `YaneuraOu-by-gcc` and _Fairy Stockfish_ default nane is `fairy-stockfish`

## Usage

**Run tests first** to make sure everything works, especially the engines:

```bash
npm run test
```

You can start Shoginet directly by running:

```bash
npm run start
```

You will probably want to run Shoginet with a process manager. For systemd (Linux) integration:

```bash
npm run systemd > /etc/systemd/system/shoginet.service
sudo systemctl daemon-reload
sudo systemctl enable --now shoginet # enable and start
```

## Shoginet workflow

1. **Start!**
   - Shoginet is initiated and fetches config from the server. The config sets parameters for move generation, analysis and puzzle verification.

2. **Request Work**
   - Shoginet -> Lishogi: "Give me work!"

3. **Receive Game**
   - Lishogi -> Shoginet: "Here's a game to analyse"
   - The work could be _analysis_, _move generation_ or _puzle verification_

4. **Analyze**
   - Shoginet is working...
   - This consumes CPU

5. **Submit Results**
   - Shoginet -> Lishogi: "Analysis result"

6. **Repeat**
   - Lishogi -> Shoginet: "Thanks, here's more work :)"
   - Rinse & repeat

7. **Stop**
   - Stop Shoginet when you need CPU power
