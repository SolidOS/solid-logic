# solid-logic
Core business logic of SolidOS

# Adendum

Solid-logic was a move to sparate business logic from UI functionality so that people using different UI frameworks could use logic code. 

It was created when the "chat with me" feature was built. We needed shared logic between chat-pane and profile-pane (which was part of solid-panes back then I think) due to that feature. The whole idea of it is to separate core solid logic from UI components, to make logic reusable, e.g. by other UI libraries or even non web apps like CLI tools etc. 
