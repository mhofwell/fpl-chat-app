-- Add missing 'draw' column to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS draw INTEGER DEFAULT 0;

-- Update the column comment for clarity
COMMENT ON COLUMN teams.draw IS 'Number of matches drawn by the team';