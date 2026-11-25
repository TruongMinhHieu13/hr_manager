const os = require('os');

const nets = os.networkInterfaces();
let ip = '127.0.0.1';

// Ưu tiên Wi-Fi hoặc Ethernet
const priorityOrder = ['wi-fi', 'wifi', 'ethernet', 'mạng không dây'];

for (const p of priorityOrder) {
  const matchKey = Object.keys(nets).find(k => k.toLowerCase().includes(p));
  if (matchKey) {
    const net = nets[matchKey].find(n => n.family === 'IPv4' && !n.internal);
    if (net) {
      ip = net.address;
      console.log(ip);
      process.exit(0);
    }
  }
}

// Fallback: bỏ qua vethernet, wsl, virtualbox, vmware
for (const name of Object.keys(nets)) {
  const lower = name.toLowerCase();
  if (lower.includes('vethernet') || lower.includes('wsl') || lower.includes('virtual') || lower.includes('vmware')) {
    continue;
  }
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
      ip = net.address;
      console.log(ip);
      process.exit(0);
    }
  }
}

console.log(ip);
