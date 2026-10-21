require 'fileutils'
require 'open3'
require 'rbconfig'
require 'tmpdir'

checker = File.expand_path('check-site.rb', __dir__)
Dir.mktmpdir('site-validator-') do |root|
  FileUtils.mkdir_p("#{root}/assets/css")
  FileUtils.mkdir_p("#{root}/assets/js")
  FileUtils.mkdir_p("#{root}/assets/images")
  assets = ['assets/css/main.css', 'assets/js/main.min.js', 'assets/images/card.png']
  assets.each { |asset| File.write("#{root}/#{asset}", 'x' * 1200) }
  File.binwrite("#{root}/assets/images/card.png", "\x89PNG\r\n\x1a\n".b + [13].pack('N') + 'IHDR' + [1200, 630].pack('NN') + 'x' * 1200)
  image = 'https://example.test/assets/images/card.png?v=control'
  html = <<~HTML
    <!doctype html><html lang="en"><head><title>Validator control</title>
    <meta name="description" content="Fixture">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Fixture">
    <meta name="twitter:description" content="Fixture">
    <meta name="twitter:image" content="#{image}">
    <meta name="twitter:image:alt" content="Fixture card">
    <meta property="og:title" content="Fixture">
    <meta property="og:description" content="Fixture">
    <meta property="og:url" content="https://example.test/">
    <meta property="og:image" content="#{image}">
    <meta property="og:image:alt" content="Fixture card">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <link rel="canonical" href="https://example.test/">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; object-src 'none'; base-uri 'self'">
    <script type="application/ld+json">{"@type":"Organization"}</script>
    </head><body><main id="main">Visible fixture</main></body></html>
  HTML
  run = lambda do |content, expected, label|
    File.write("#{root}/index.html", content)
    output, status = Open3.capture2e(RbConfig.ruby, checker, root, '--release')
    raise "#{label}: unexpected result: #{output}" unless status.success? == expected
    puts "#{label}: #{expected ? 'accepted' : 'blocked'}"
  end
  run.call(html, true, 'Valid independent fixture')
  run.call(html.sub('Visible fixture', 'Visible fixture<pre><code>{{ site.title }}</code></pre>'), true, 'Intentional Liquid code example')
  {
    'Missing title' => html.sub('<title>Validator control</title>', ''),
    'Missing content' => html.sub('Visible fixture', ''),
    'Missing social image' => html.sub('<meta property="og:image"', '<meta property="removed"'),
    'Missing social image description' => html.sub('<meta property="og:image:alt"', '<meta property="removed"'),
    'Missing social image size' => html.sub('<meta property="og:image:width"', '<meta property="removed"'),
    'Incorrect social image size' => html.sub('content="1200"', 'content="600"'),
    'Missing social image version' => html.gsub('?v=control', ''),
    'Missing CSP' => html.sub("object-src 'none'", "object-src 'self'"),
    'Invalid JSON-LD' => html.sub('{"@type":"Organization"}', '{broken}'),
    'Unrendered Liquid' => html.sub('Visible fixture', '{{ site.title }}')
  }.each { |label, broken| run.call(broken, false, label) }
  assets.each do |asset|
    File.rename("#{root}/#{asset}", "#{root}/#{asset}.bak")
    run.call(html, false, "Missing #{asset}")
    File.rename("#{root}/#{asset}.bak", "#{root}/#{asset}")
  end
  ['assets/css/main.css.map', '.debug.map'].each do |map|
    File.write("#{root}/#{map}", '{"version":3,"sources":["private.scss"]}')
    run.call(html, false, "Public source map artifact #{map}")
    File.delete("#{root}/#{map}")
  end
  ['assets/css/main.css', 'assets/js/main.min.js'].each do |asset|
    original = File.binread("#{root}/#{asset}")
    File.binwrite("#{root}/#{asset}", original + "\n/*# sourceMappingURL=data:application/json;base64,e30= */")
    run.call(html, false, "Source map reference in #{asset}")
    File.binwrite("#{root}/#{asset}", original)
  end
  run.call(html, true, 'Restored artifact controls')
  File.write("#{root}/other.html", html.sub('<title>Validator control</title>', ''))
  run.call(html, false, 'Invalid second route')
end
