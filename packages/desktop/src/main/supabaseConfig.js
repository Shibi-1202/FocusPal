const fs = require('fs');
const path = require('path');

function getConfigFilePath() {
  if (process.resourcesPath && process.defaultApp !== true) {
    return path.join(process.resourcesPath, 'config', 'supabase.json');
  }

  return path.resolve(__dirname, '../../config/supabase.json');
}

function readFileConfig() {
  const filePath = getConfigFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error(`Failed to read Supabase config from ${filePath}:`, error.message);
    return {};
  }
}

const fileConfig = readFileConfig();

module.exports = {
  filePath: getConfigFilePath(),
  url: process.env.SUPABASE_URL || fileConfig.url || '',
  anonKey: process.env.SUPABASE_ANON_KEY || fileConfig.anonKey || '',
  passwordResetRedirectURL:
    process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL || fileConfig.passwordResetRedirectURL || ''
};
