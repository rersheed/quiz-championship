import { DEFAULT_LOGO, type Competition } from '../data';

export function downloadWinnerCertificate(opts: {
  competition: Competition;
  schoolName: string;
  placeLabel: string;
  categoryName: string;
  score?: number;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 990;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0A1628');
  gradient.addColorStop(0.55, '#122848');
  gradient.addColorStop(1, '#1A3A5C');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#3D93CF';
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
  ctx.strokeStyle = '#45A849';
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, canvas.width - 104, canvas.height - 104);

  ctx.fillStyle = '#7EC0EA';
  ctx.font = '700 28px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IMJ GROUP ANNUAL SCHOOLS QUIZ COMPETITION', canvas.width / 2, 140);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px Outfit, sans-serif';
  ctx.fillText('Certificate of Achievement', canvas.width / 2, 240);

  ctx.fillStyle = '#b9c5d7';
  ctx.font = '500 26px DM Sans, sans-serif';
  ctx.fillText(`Presented to`, canvas.width / 2, 340);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 54px Outfit, sans-serif';
  ctx.fillText(opts.schoolName, canvas.width / 2, 420);

  ctx.fillStyle = '#7EC0EA';
  ctx.font = '700 32px Outfit, sans-serif';
  ctx.fillText(opts.placeLabel, canvas.width / 2, 500);

  ctx.fillStyle = '#b9c5d7';
  ctx.font = '500 24px DM Sans, sans-serif';
  ctx.fillText(`${opts.categoryName} · ${opts.competition.year} Championship`, canvas.width / 2, 560);
  if (typeof opts.score === 'number') {
    ctx.fillText(`Official final score: ${opts.score} points`, canvas.width / 2, 600);
  }

  ctx.fillStyle = '#45A849';
  ctx.font = '700 22px DM Sans, sans-serif';
  ctx.fillText(opts.competition.venue || 'Official competition result', canvas.width / 2, 690);

  ctx.fillStyle = '#8BB8D9';
  ctx.font = '600 18px DM Sans, sans-serif';
  ctx.fillText(opts.competition.organizer || 'IMJ Group', canvas.width / 2, 760);
  ctx.fillText(opts.competition.short_title || opts.competition.title, canvas.width / 2, 790);

  const logo = new Image();
  logo.crossOrigin = 'anonymous';
  const finish = () => {
    try {
      if (logo.complete && logo.naturalWidth) {
        ctx.drawImage(logo, canvas.width / 2 - 40, 820, 80, 80);
      }
    } catch {
      /* logo may be opaque-tainted in some hosts; text certificate still downloads */
    }
    const link = document.createElement('a');
    link.download = `${opts.schoolName.replace(/\s+/g, '-')}-${opts.placeLabel.replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  logo.onload = finish;
  logo.onerror = finish;
  logo.src = opts.competition.logo_url || DEFAULT_LOGO;
}
