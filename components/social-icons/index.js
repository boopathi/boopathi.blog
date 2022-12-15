const SocialIcon = ({ kind, href }) => {
  if (!href || (kind === 'mail' && !/^mailto:\w+([.-]?\w+)@\w+([.-]?\w+)(.\w{2,3})+$/.test(href)))
    return null

  return (
    <a
      className="text-sm text-gray-500 transition hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
      target="_blank"
      rel="me noopener noreferrer"
      href={href}
    >
      {kind.toUpperCase()}
    </a>
  )
}

export default SocialIcon
