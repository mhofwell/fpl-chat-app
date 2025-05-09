async function checkMatches() {
  const res = await fetch('https://your-domain.com/api/cron/check-match-schedule', {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
  });
  const data = await res.json();
  
  // Exit with code 0 if matches active/upcoming (continue pipeline)
  // Exit with code 1 if no matches (stop pipeline)
  process.exit(data.hasActiveMatches || data.hasUpcomingMatches ? 0 : 1);
}

checkMatches();
