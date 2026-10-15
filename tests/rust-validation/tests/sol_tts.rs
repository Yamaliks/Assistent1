use assistent1_launch_validation_tests::sol_tts::{normalize_wave, phrase};

#[test]
fn only_known_russian_responses_can_be_synthesized() {
    for id in [
        "hello",
        "listening",
        "opening",
        "mode",
        "done",
        "errors",
        "unknown",
        "cancelled",
        "goodbye",
    ] {
        assert!(phrase(id)
            .unwrap()
            .chars()
            .any(|c| ('а'..='я').contains(&c)));
    }
    assert!(phrase("--shell-command").is_err());
    assert_ne!(phrase("errors").unwrap(), phrase("done").unwrap());
}

#[test]
fn streaming_wave_lengths_are_normalized_but_silence_and_invalid_pcm_are_rejected() {
    let mut header = b"RIFF\0\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x22\x56\0\0\x44\xac\0\0\x02\0\x10\0data\0\xf0\xff\x7f".to_vec();
    header.extend_from_slice(&[0, 0]);
    assert!(normalize_wave(header.clone()).is_err());
    header.extend_from_slice(&[1, 0]);
    let wave = normalize_wave(header.clone()).unwrap();
    assert_eq!(u32::from_le_bytes(wave[4..8].try_into().unwrap()), 40);
    assert_eq!(u32::from_le_bytes(wave[40..44].try_into().unwrap()), 4);
    header[20] = 3; // Float is not the promised PCM16.
    assert!(normalize_wave(header).is_err());
    assert!(normalize_wave(vec![0; 45]).is_err());
}
