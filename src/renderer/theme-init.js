(function () {
  const themes = new Set(['dark', 'light', 'pink'])
  const theme = new URLSearchParams(window.location.search).get('theme')
  const initialTheme = themes.has(theme) ? theme : 'light'

  document.documentElement.dataset.theme = initialTheme
  if (document.body) document.body.dataset.theme = initialTheme

  document.addEventListener('DOMContentLoaded', () => {
    document.body.dataset.theme = initialTheme
    document.querySelectorAll('#themeSwitch [data-theme]').forEach((button) => {
      button.classList.toggle('active', button.dataset.theme === initialTheme)
    })
  }, { once: true })
}())
