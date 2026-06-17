const fs = require('fs');
const path = require('path');

const envVar = process.env.GOOGLE_SERVICES_JSON;

if (!envVar) {
  console.log('ℹ️  GOOGLE_SERVICES_JSON não definido — pulando (build local).');
  process.exit(0);
}

const dest = path.resolve(__dirname, '..', 'google-services.json');

// File env var: GOOGLE_SERVICES_JSON é o PATH do arquivo temporário criado pelo EAS
if (fs.existsSync(envVar)) {
  fs.copyFileSync(envVar, dest);
  console.log('✅ google-services.json copiado de', envVar);
} else {
  // Fallback: conteúdo direto como string
  fs.writeFileSync(dest, envVar, 'utf8');
  console.log('✅ google-services.json escrito a partir do conteúdo da variável');
}
