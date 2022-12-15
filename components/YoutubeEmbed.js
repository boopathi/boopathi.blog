const YoutubeEmbed = ({ id, title }) => (
  <div className="relative overflow-hidden">
    <iframe
      className="w-full"
      width="853"
      height="480"
      src={`https://www.youtube.com/embed/${id}`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      title={title || 'Embedded youtube video'}
    />
  </div>
)

export default YoutubeEmbed
