# Shoginet

[![lishogi.org](https://img.shields.io/badge/☗_lishogi.org-Play_shogi-black)](https://lishogi.org)
[![en](https://img.shields.io/badge/lang-en-blue.svg)](https://github.com/WandererXII/shoginet/blob/main/README.md)

自動翻訳:

**[Lishogi.org](https://lishogi.org) のための分散ネットワーク**

## インストール

```console
git clone https://github.com/WandererXII/shoginet.git
cd shoginet
npm install
```

**注意:** Shoginetを実行する**前に**、エンジンを入手してインストールする必要があります：

* **Linux - ソースから:** `./scripts/yaneuraou.sh` と `./scripts/fairy.sh` を使用して、エンジンを自分でダウンロードしビルドしてください。C/C++コンパイラとビルドツールがインストールされていることを確認してください。エンジンごとに数分かかります。
* **バイナリの使用:** お使いのOSとCPUに適したバージョンを確実にダウンロードしてください。
  - やねうら王 (YaneuraOu) - [YaneuraOu リポジトリのリリース](https://github.com/yaneurao/YaneuraOu/releases)
  - Fairy Stockfish - [Fairy Stockfish 公式サイト](https://fairy-stockfish.github.io/download/) から、largeboard (all variants) バージョンをダウンロードしてください

エンジンへのパスが正しく設定されているか、忘れずに確認してください（次のステップ）。

## 設定 (Configuration)

設定は `config` ディレクトリに保存されています。独自のオーバーライド設定は `local.json` に記述してください。

最も重要なのは、エンジンへのパスが正しく設定されているか確認することです。デフォルトでは `engines` ディレクトリを探します。_やねうら王 (YaneuraOu)_ エンジンのデフォルト名は `YaneuraOu-by-gcc`、_Fairy Stockfish_ のデフォルト名は `fairy-stockfish` です。

## 使い方

特にエンジンが正しく動作するか確認するために、**最初にテストを実行してください**：

```console
npm run test
```

テストが正常にパスした場合、以下を実行してShoginetを直接起動できます：

```console
npm run start
```

通常、Shoginetはプロセスマネージャーを使用して実行することになるでしょう。systemd (Linux) と統合する場合は以下のようにします：

```console
node ./scripts/systemd.js | sudo tee /etc/systemd/system/shoginet.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl start shoginet
```

## Shoginet のワークフロー

1. **開始!**
   - Shoginetが起動し、サーバーから設定を取得します。この設定により、指し手生成、検討（解析）、詰将棋の検証のためのパラメータがセットされます。

2. **タスクの要求**
   - Shoginet -> Lishogi: 「仕事をください！」

3. **タスクの受信**
   - Lishogi -> Shoginet: 「解析すべき対局はこちらです」
   - タスクの内容は、_検討_、_指し手生成_、あるいは _詰将棋の検証_ の場合があります。キューが空の場合は何もしません。

4. **タスクの処理**
   - Shoginetが対局を解析中...
   - これにはCPUを使用します。

5. **結果の送信**
   - Shoginet -> Lishogi: 「解析結果はこちらです」

6. **繰り返し**
   - Lishogi -> Shoginet: 「ありがとう、次の仕事です :)」
   - これを繰り返します。

7. **停止**
   - CPUパワーが必要になったらShoginetを停止します。Shoginetは進行中の作業を完了してから終了しようとします。もし即座に中断したい場合は、もう一度 CTRL^C を押してください。