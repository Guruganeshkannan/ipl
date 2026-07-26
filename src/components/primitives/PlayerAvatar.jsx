import { useState } from 'react';

function initials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function dicebearUrl(name) {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=15181d&radius=50`;
}

// Single chokepoint for player imagery: real photo -> DiceBear cartoon ->
// initials monogram on the team's colour. Each stage degrades gracefully
// via onError so a broken/missing source never shows a blank image.
export default function PlayerAvatar({ player, size = 64, teamColor = 'var(--signal)', fontScale = 0.34 }) {
  const [stage, setStage] = useState(player?.photoUrl ? 'photo' : 'dicebear');

  const style = {
    width: size,
    height: size,
    border: `2px solid ${teamColor}`,
  };

  if (!player) {
    return (
      <div className="player-avatar" style={style}>
        <div className="monogram" style={{ background: teamColor, fontSize: size * fontScale }}>?</div>
      </div>
    );
  }

  if (stage === 'photo') {
    return (
      <div className="player-avatar" style={style}>
        <img
          src={player.photoUrl}
          alt={player.name}
          onError={() => setStage('dicebear')}
        />
      </div>
    );
  }

  if (stage === 'dicebear') {
    return (
      <div className="player-avatar" style={style}>
        <img
          src={dicebearUrl(player.name)}
          alt={player.name}
          onError={() => setStage('monogram')}
        />
      </div>
    );
  }

  return (
    <div className="player-avatar" style={style}>
      <div className="monogram" style={{ background: teamColor, fontSize: size * fontScale }}>
        {initials(player.name)}
      </div>
    </div>
  );
}
