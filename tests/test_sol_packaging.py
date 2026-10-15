"""Packaging security/metadata tests; fixtures are not Russian models or license evidence."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("prepare_sol", Path(__file__).parents[1] / "scripts/prepare_sol.py")
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)

class PackagingTests(unittest.TestCase):
    def test_exact_model_license_row_required(self):
        sample = '<tr><td><a href="https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip">ru</a></td><td>Apache 2.0</td></tr>'
        self.assertIn('Apache 2.0', pack.model_license(sample))
        for bad in [sample.replace('0.22.zip', '0.22-lgraph.zip'), sample.replace('Apache 2.0', 'Unknown'), '<tr>Apache 2.0</tr>']:
            with self.assertRaises(ValueError):
                pack.model_license(bad)

    def test_pins_and_runtime_upload_agree(self):
        self.assertEqual(pack.RUNTIME['minBytes'], 14882445)
        self.assertEqual(pack.MODEL['sha256'], '961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4')
        config = json.loads((pack.ROOT / 'src-tauri/tauri.bundle.conf.json').read_text())
        self.assertEqual(config['bundle']['resources'], {'resources/sol/': 'sol/'})
        self.assertEqual(config['bundle']['windows']['nsis']['installMode'], 'currentUser')
        self.assertEqual(config['bundle']['windows']['webviewInstallMode']['type'], 'offlineInstaller')

    def test_size_hash_and_traversal_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            path = temp / 'model(1).zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('vosk-model-small-ru-0.22/../../escape', b'bad')
            with self.assertRaises(ValueError):
                pack.check_archive(path, pack.MODEL)
            with self.assertRaises(ValueError):
                pack.extract(path, pack.MODEL, temp / 'output')
            self.assertFalse((temp / 'escape').exists())

    def test_archive_filename_does_not_change_internal_model_directory(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            archive = temp / 'vosk-model-small-ru-0.22(1).zip'
            with zipfile.ZipFile(archive, 'w') as out:
                out.writestr('vosk-model-small-ru-0.22/conf/model.conf', b'fixture only')
            pack.extract(archive, pack.MODEL, temp / 'model')
            self.assertEqual((temp / 'model/conf/model.conf').read_bytes(), b'fixture only')

    def test_source_header_alias_is_materialized_only_when_explicitly_reviewed(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            path = temp / 'source.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                alias = zipfile.ZipInfo('source/include/alias.h')
                alias.create_system = 3
                alias.external_attr = 0o120777 << 16
                archive.writestr(alias, '../header.h')
                archive.writestr('source/header.h', 'real header')
            with self.assertRaises(ValueError):
                pack.extract(path, {'name': 'source'}, temp / 'denied')
            pack.extract(path, {'name': 'source'}, temp / 'allowed', {'source/include/alias.h': ('../header.h', 'source/header.h')})
            self.assertFalse((temp / 'allowed/include/alias.h').is_symlink())
            self.assertEqual((temp / 'allowed/include/alias.h').read_text(), 'real header')

    def test_tts_uses_pinned_complete_source_and_no_network_at_runtime(self):
        import sys
        sys.path.insert(0, str(pack.ROOT / 'scripts'))
        import prepare_tts
        self.assertEqual(prepare_tts.ESPEAK['sha256'], 'b4517592e3cbc43703bb1c782702eafb98097659e0b7e96e69c32ee32ae5003a')
        self.assertEqual(prepare_tts.SONIC['sha256'], 'd7c5a715f574a4a2a5afe970f489d3950bcd5229f1bed3f0e010a5413957ec20')
        self.assertTrue((pack.ROOT / 'docs/SOL-TTS.md').is_file())

if __name__ == '__main__':
    unittest.main()
