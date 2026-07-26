import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const ROOMS_TMP_FILE = path.join(DATA_DIR, 'rooms.json.tmp');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_FILE)) return {};
    const data = fs.readFileSync(ROOMS_FILE, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (error) {
    console.error('Error reading rooms file:', error);
    return {};
  }
}

let writeInFlight = false;
let writePending = false;

// Debounced, async, atomic save. Rooms are re-saved every broadcast tick
// (every 1.2s per active room) so a synchronous write here would stall the
// event loop under load; this coalesces bursts into one write per interval.
export function saveRooms(rooms) {
  writePending = true;
  if (writeInFlight) return;
  writeInFlight = true;

  const flush = async () => {
    while (writePending) {
      writePending = false;
      const dataToSave = {};
      for (const [code, room] of Object.entries(rooms)) {
        dataToSave[code] = room.toJSON ? room.toJSON() : room;
      }
      try {
        await fs.promises.writeFile(ROOMS_TMP_FILE, JSON.stringify(dataToSave), 'utf-8');
        await fs.promises.rename(ROOMS_TMP_FILE, ROOMS_FILE);
      } catch (error) {
        console.error('Error saving rooms file:', error);
      }
    }
    writeInFlight = false;
  };

  flush();
}
