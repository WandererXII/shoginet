import { execSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path'; 

function systemdConfig() {
  const cwd = process.cwd();
  const user = execSync('whoami').toString().trim();
  const group = execSync('id -gn').toString().trim();

  const npmPath = execSync('which npm').toString().trim();
  const nodeBinDir = path.dirname(process.execPath);
  const envPath = `PATH=${nodeBinDir}:/usr/bin:/bin`;

  const output = `[Unit]
After=network-online.target
Wants=network-online.target

[Service]
Environment="${envPath}"
ExecStartPre=${npmPath} run test
ExecStart=${npmPath} run start

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
Restart=on-failure
RestartSec=5
TimeoutStopSec=610
KillSignal=SIGINT
KillMode=control-group

[Install]
WantedBy=multi-user.target
`;

  console.log(output);
}

systemdConfig();
