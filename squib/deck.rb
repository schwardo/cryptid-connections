require 'squib'

data = Squib.csv file: '../cryptids.csv'

categories = ['head', 'eyes', 'mouth', 'hands', 'skin', 'tail']

#Squib.print_system_fonts

Squib::Deck.new cards: data['title'].size, layout: 'layout.yml' do
  background color: "#121212"
  text_color = 'white'
#  font = 'FreeSerif Bold'
  font = 'DejaVu Serif'
  total_width = 825
  total_height = 1125

  png file: data['image_filename'].map { |x| "../artwork/cropped/#{x}.png" },
      x: 0, y: 0,
      width: 825, height: 1125

  # Card frame
  png file: "../graphics/card-frame.png",
      x: 65, y: 50,
      width: 696, height: 1016

  # Creature name (from CSV data)
  title_width = 400
  title_height = 70
  text str: data['title'],
       x: (total_width-title_width)/2, y: 100, width: title_width, height: title_height,
       font: font, font_size: 7, color: text_color, align: :center, valign: :middle

  # Draw all icons on top (foreground layer) with slight overlap onto center image
  (1..6).each do |i|
    attr = categories[i-1]
    png file: data[attr].map { |x| "../graphics/icons/#{attr}-#{x}.png" },
        x: 80, y: 80+130*(i-1),
        width: 115, height: 125
  end

  border_width = 75
  border_color = "#121212"
  rect x: 0, y: 0, width: total_width, height: border_width,
       fill_color: border_color, stroke_color: border_color
  rect x: 0, y: total_height-border_width, width: total_width, height: border_width,
       fill_color: border_color, stroke_color: border_color
  rect x: 0, y: 0, width: border_width, height: total_height, fill_color: border_color,
       stroke_color: border_color
  rect x: total_width-border_width, y: 0, width: border_width, height: total_height,
       fill_color: border_color, stroke_color: border_color

#  rect layout: :cut, stroke_color: text_color # cut line as defined by TheGameCrafter
#  rect layout: :safe, stroke_color: text_color # safe zone as defined by TheGameCrafter

  save_png
end
