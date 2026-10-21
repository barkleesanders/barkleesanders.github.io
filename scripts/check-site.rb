require 'nokogiri'
require 'pathname'
root = Pathname.new(ARGV.fetch(0))
index = root.join('index.html')
abort 'missing rendered index' unless index.file?
html = Nokogiri::HTML(index.read)
abort 'missing rendered title' if html.at_css('title')&.text.to_s.strip.empty?
abort 'missing main content' if html.at_css('#main')&.text.to_s.strip.empty?
css = root.join('assets/css/main.css')
abort 'missing compiled theme CSS' unless css.file? && css.size > 1000
js = root.join('assets/js/main.min.js')
abort 'missing JavaScript bundle' unless js.file? && js.size > 1000
abort 'unrendered Liquid' if html.at_css('body')&.text.to_s.include?('{{ site.')
puts "Rendered #{Dir[root.join('**/*.html')].size} HTML pages; title, main, CSS and JavaScript present."
