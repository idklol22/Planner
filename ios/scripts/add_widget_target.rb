# Adds Planner's native files and the widget extension to the Xcode project.
# Run on the build Mac before `pod install`:  ruby ios/scripts/add_widget_target.rb
# Safe to run again; it changes nothing the second time.
require 'xcodeproj'

root = File.expand_path('../App', __dir__)
project = Xcodeproj::Project.open(File.join(root, 'App.xcodeproj'))
app = project.targets.find { |t| t.name == 'App' } or abort('App target not found')

if project.targets.any? { |t| t.name == 'PlannerWidgets' }
  puts 'PlannerWidgets target already present'
  exit 0
end

app_group = project.main_group.find_subpath('App', false) or abort('App group not found')
%w[PlannerNativePlugin.swift MainViewController.swift].each do |name|
  app.add_file_references([app_group.new_file(name)])
end

widget = project.new_target(:app_extension, 'PlannerWidgets', :ios, '17.0')
widget_root = File.join(root, 'PlannerWidgets')
group = project.main_group.new_group('PlannerWidgets', 'PlannerWidgets')
sources = Dir.glob(File.join(widget_root, '**', '*.swift')).sort
abort('No widget sources found') if sources.empty?
widget.add_file_references(sources.map { |path| group.new_file(path.delete_prefix("#{widget_root}/")) })

release = app.build_configurations.find { |c| c.name == 'Release' }
widget.build_configurations.each do |config|
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => "#{release.build_settings['PRODUCT_BUNDLE_IDENTIFIER']}.widgets",
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'INFOPLIST_FILE' => 'PlannerWidgets/Info.plist',
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'MARKETING_VERSION' => release.build_settings['MARKETING_VERSION'] || '1.0',
    'CURRENT_PROJECT_VERSION' => release.build_settings['CURRENT_PROJECT_VERSION'] || '1',
    'SWIFT_VERSION' => '5.0',
    'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'SKIP_INSTALL' => 'YES',
    'APPLICATION_EXTENSION_API_ONLY' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  )
end

app.add_dependency(widget)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
embed.add_file_reference(widget.product_reference).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "Added PlannerWidgets with #{sources.size} source files"
