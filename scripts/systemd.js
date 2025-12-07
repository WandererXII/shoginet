import { execSync } from 'node:child_process';
import process from 'node:process';

function systemdConfig() {
  const cwd = process.cwd();
  const user = execSync('whoami').toString().trim();
  const group = execSync('id -gn').toString().trim();

  const output = `[Unit]
After=network-online.target
Wants=network-online.target

[Service]
ExecStartPre=/usr/bin/npm run test
ExecStart=/usr/bin/npm run start
WorkingDirectory=${cwd}
ReadWriteDirectories=${cwd}
User=${user}
Group=${group}
Nice=5
CapabilityBoundingSet=
PrivateTmp=true
PrivateDevices=true
DevicePolicy=closed
ProtectSystem=strict
NoNewPrivileges=true
Restart=always
RestartSec=5
TimeoutStopSec=300
KillSignal=SIGINT
KillMode=control-group

[Install]
WantedBy=multi-user.target
`;

  console.log(output);
}

systemdConfig();
