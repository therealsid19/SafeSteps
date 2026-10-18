Pod::Spec.new do |s|
  s.name           = 'SafeStepAR'
  s.version        = '1.0.0'
  s.summary        = 'SafeStep obstacle detection with ARKit (LiDAR) and CoreML'
  s.description    = s.summary
  s.author         = 'SafeStep'
  s.homepage       = 'https://github.com/therealsid19/SafeStep'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'CoreML', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
  # yolo26n.mlpackage (or .mlmodelc) goes in ios/models/ - see ../README.md
  s.resources = 'models/*.{mlpackage,mlmodelc}'
end
