cmake_minimum_required(VERSION 3.18)
project(wetext_wasm LANGUAGES CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure this project with emcmake cmake")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
foreach(feature BIN SCRIPT COMPACT COMPRESS CONST FAR FSTS GRM LINEAR LOOKAHEAD MPDT NGRAM PDT SPECIAL)
  set(HAVE_${feature} OFF CACHE BOOL "" FORCE)
endforeach()
add_compile_definitions(FST_NO_DYNAMIC_LINKING)
add_subdirectory(vendor/openfst EXCLUDE_FROM_ALL)

add_executable(wetext native/wetext.cc)
target_include_directories(wetext PRIVATE vendor/pynini-2.1.7/extensions)
target_link_libraries(wetext PRIVATE fst)
target_compile_options(wetext PRIVATE -fexceptions)
target_link_options(wetext PRIVATE
  --bind
  -fexceptions
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sDYNAMIC_EXECUTION=0
  -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=67108864
  -sEXCEPTION_STACK_TRACES=1
  "-sEXPORTED_RUNTIME_METHODS=['FS','getExceptionMessage','decrementExceptionRefcount']"
)
set_target_properties(wetext PROPERTIES SUFFIX ".js")
