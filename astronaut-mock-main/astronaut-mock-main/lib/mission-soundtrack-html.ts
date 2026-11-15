const staticScriptTag = '<script src="mission-soundtrack.js" defer></script>'
const routedScriptTag = '<script src="/api/mission-soundtrack" defer></script>'

export function routeMissionSoundtrack(html: string) {
  if (!html.includes(staticScriptTag)) {
    throw new Error('The HTML page is missing its mission soundtrack script reference.')
  }
  return html.replace(staticScriptTag, routedScriptTag)
}
