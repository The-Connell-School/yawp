import { useState } from 'react'

export const useAudio = (audioRef: HTMLAudioElement | null) => {
	const [isPlaying, setIsPlaying] = useState(false)

	const togglePlayPause = () => {
		if (audioRef) {
			if (audioRef.paused) {
				audioRef.play()
				setIsPlaying(true)
			} else {
				audioRef.pause()
				setIsPlaying(false)
			}
		}
	}

	const stopAudio = () => {
		if (audioRef) {
			audioRef.pause()
			audioRef.currentTime = 0
		}
	}

	const setPlaybackRate = (rate: number) => {
		if (audioRef) {
			audioRef.playbackRate = rate
		}
	}

	return {
		isPlaying,
		setIsPlaying,
		togglePlayPause,
		stopAudio,
		setPlaybackRate,
	}
}
