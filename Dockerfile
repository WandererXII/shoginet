FROM debian:stable AS builder

WORKDIR /shoginet
COPY ./build-yaneuraou.sh .

RUN apt update && apt install -y git build-essential clang
RUN ./build-yaneuraou.sh

FROM python:3.9

WORKDIR /shoginet
COPY --from=builder /shoginet/YaneuraOu-by-gcc /shoginet/
COPY ./shoginet.py /shoginet/shoginet.py
COPY ./eval/nn.bin /shoginet/eval/nn.bin

RUN pip install requests

CMD ["python3", "shoginet.py"]
