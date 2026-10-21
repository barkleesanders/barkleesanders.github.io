require 'nokogiri'
require 'pathname'
require 'json'
require 'uri'

root = Pathname.new(ARGV.fetch(0))
release = ARGV.include?('--release')
abort 'missing rendered index' unless root.join('index.html').file?
pages = Dir[root.join('**/*.html')]
pages.each do |path|
  html = Nokogiri::HTML(File.read(path))
  abort "#{path}: missing rendered title" if html.at_css('title')&.text.to_s.strip.empty?
  abort "#{path}: missing main content" if html.at_css('#main')&.text.to_s.strip.empty?
  content = html.at_css('body')&.dup
  # Theme documentation intentionally teaches Liquid inside code examples.
  content&.css('pre, code')&.remove
  abort "#{path}: unrendered Liquid" if content&.text.to_s.include?('{{ site.')
  html.css('script[type="application/ld+json"]').each do |script|
    begin
      JSON.parse(script.text)
    rescue JSON::ParserError => error
      abort "#{path}: invalid structured data: #{error.message}"
    end
  end
  next unless release

  ['description', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'].each do |name|
    abort "#{path}: missing #{name}" if html.at_css("meta[name='#{name}']")&.[]('content').to_s.strip.empty?
  end
  ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'og:image:width', 'og:image:height'].each do |name|
    abort "#{path}: missing #{name}" if html.at_css("meta[property='#{name}']")&.[]('content').to_s.strip.empty?
  end
  ['og:image', 'twitter:image'].each do |name|
    uri = URI.parse(html.at_css("meta[property='#{name}'], meta[name='#{name}']")['content'])
    abort "#{path}: #{name} must be an absolute HTTPS URL" unless uri.scheme == 'https' && uri.host
    abort "#{path}: #{name} missing image version" unless URI.decode_www_form(uri.query.to_s).any? { |key, value| key == 'v' && !value.empty? }
    asset = root.join(uri.path.delete_prefix('/'))
    abort "#{path}: missing social preview asset" unless asset.file? && asset.size > 1000
    if name == 'og:image'
      header = asset.binread(24)
      abort "#{path}: social preview must be a measured PNG" unless header.start_with?("\x89PNG\r\n\x1a\n".b)
      actual = header.byteslice(16, 8).unpack('NN')
      declared = ['og:image:width', 'og:image:height'].map { |field| html.at_css("meta[property='#{field}']")['content'].to_i }
      abort "#{path}: social preview dimensions #{declared.inspect} do not match PNG #{actual.inspect}" unless declared == actual
    end
  end
  canonical = URI.parse(html.at_css('link[rel="canonical"]')&.[]('href').to_s)
  abort "#{path}: missing canonical HTTPS URL" unless canonical.scheme == 'https' && canonical.host
  policy = html.at_css('meta[http-equiv="Content-Security-Policy"]')&.[]('content').to_s
  ["default-src 'self'", "object-src 'none'", "base-uri 'self'"].each do |directive|
    abort "#{path}: missing CSP #{directive}" unless policy.split(';').map(&:strip).include?(directive)
  end
end
css = root.join('assets/css/main.css')
abort 'missing compiled theme CSS' unless css.file? && css.size > 1000
js = root.join('assets/js/main.min.js')
abort 'missing JavaScript bundle' unless js.file? && js.size > 1000
files = Dir.glob(root.join('**/*').to_s, File::FNM_DOTMATCH).select { |path| File.file?(path) }
maps = files.select { |path| path.downcase.end_with?('.map') }
abort "public source map artifacts: #{maps.join(', ')}" unless maps.empty?
bundles = files.select { |path| ['.js', '.css'].include?(File.extname(path).downcase) }
bundles.each do |path|
  abort "#{path}: public sourceMappingURL reference" if File.binread(path).include?('sourceMappingURL')
end
puts "Rendered #{pages.size} HTML pages; title, main, structured data, CSS and JavaScript present#{release ? '; release metadata and CSP checked' : ''}."
puts "Checked #{bundles.size} JavaScript/CSS assets; no source map artifacts or references."
