__gitspy_user_zdotdir=${GITSPY_USER_ZDOTDIR:-$HOME}
[[ -f "$__gitspy_user_zdotdir/.zshenv" ]] && source "$__gitspy_user_zdotdir/.zshenv"
[[ -f "$__gitspy_user_zdotdir/.zshrc" ]] && source "$__gitspy_user_zdotdir/.zshrc"
unset __gitspy_user_zdotdir
__gitspy_prompt_start() { printf '\e]133;A\a' }
__gitspy_report_cwd() { printf '\e]7;file://%s%s\a' "$HOST" "$PWD" }
__gitspy_preexec() { printf '\e]133;C\a' }
__gitspy_precmd() { printf '\e]133;D;%s\a' "$?"; __gitspy_report_cwd; __gitspy_prompt_start }
autoload -Uz add-zsh-hook
add-zsh-hook preexec __gitspy_preexec
add-zsh-hook precmd __gitspy_precmd
__gitspy_announce_session_start() { __gitspy_report_cwd; __gitspy_prompt_start }
__gitspy_announce_session_start
