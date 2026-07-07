require 'webrick'

port = ENV['PORT'] || 3000

server = WEBrick::HTTPServer.new(Port: port)

server.mount_proc '/' do |req, res|
  res.content_type = 'text/html'
  res.body = '<h1>Hello from Ruby!</h1>'
end

trap('INT') { server.shutdown }
puts "Server running on port #{port}"
server.start
