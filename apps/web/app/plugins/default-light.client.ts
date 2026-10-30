/**
 * The shop works in daylight; a dark OS must not force the dark theme.
 * Anyone who explicitly picks dark in the toggle keeps it (preference !== 'system').
 */
export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()
  if (colorMode.preference === 'system') {
    colorMode.preference = 'light'
  }
})
